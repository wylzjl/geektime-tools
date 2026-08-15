'use strict';

const https = require('https');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

function buildCookieHeader(cookies) {
  return Object.entries(cookies || {})
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * 通用 HTTPS JSON 请求。
 * 注意：缺 Origin/Referer 会被 WAF 判定为爬虫并返回 HTTP 451，因此默认带上。
 * @returns {Promise<{statusCode:number, headers:object, data:any}>} data 为解析后的 JSON，解析失败则为原始字符串
 */
function requestJson(method, hostname, pathname, { cookieHeader, headers = {}, body, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: pathname,
        method,
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/json',
          Origin: 'https://time.geekbang.org',
          Referer: 'https://time.geekbang.org/',
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ statusCode: res.statusCode, headers: res.headers, data });
        });
      }
    );
    req.setTimeout(timeout, () =>
      req.destroy(new Error(`请求超时(${timeout}ms): ${method} ${hostname}${pathname}`))
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/** 极客时间 API 统一调用：检查 HTTP 状态码与业务 code，返回整体 body */
async function apiCall(hostname, pathname, { cookies, body, method = 'POST', timeout } = {}) {
  const result = await requestJson(method, hostname, pathname, {
    cookieHeader: buildCookieHeader(cookies),
    body,
    timeout,
  });
  if (result.statusCode !== 200) {
    throw new Error(`${pathname} 请求失败: HTTP ${result.statusCode}`);
  }
  const data = result.data;
  if (!data || data.code !== 0) {
    throw new Error(
      `${pathname} 接口返回错误: code=${data && data.code}, msg=${(data && data.msg) || '未知错误'}`
    );
  }
  return data;
}

/** 分页工具：按 prev 偏移循环拉取，直到页不满 / 无更多 / 达到 maxPages */
async function paginate(hostname, pathname, { cookies, makeBody, extract, all, logger, maxPages = 100 }) {
  const collected = [];
  let prev = 0;
  for (let page = 0; page < maxPages; page++) {
    logger && logger.debug(`拉取 ${pathname} 第 ${page + 1} 页 (prev=${prev})`);
    const data = await apiCall(hostname, pathname, {
      cookies,
      body: makeBody(prev),
    });
    const pageItems = extract(data) || [];
    collected.push(...pageItems);
    const hasMore =
      data.data && typeof data.data.has_more !== 'undefined'
        ? data.data.has_more
        : pageItems.length > 0;
    if (!hasMore || !all) break;
    prev += pageItems.length;
  }
  return collected;
}

/** 获取已购课程列表 */
async function getCourses(cookies, { size = 20, all = false, logger } = {}) {
  return paginate('time.geekbang.org', '/serv/v3/learn/product', {
    cookies,
    all,
    logger,
    makeBody: (prev) => ({
      desc: true,
      expire: 1,
      last_learn: 0,
      learn_status: 0,
      prev,
      size,
      sort: 1,
      type: '',
      with_learn_count: 1,
    }),
    extract: (data) => (data.data && data.data.products) || [],
  });
}

/** 获取专栏文章列表 */
async function getColumnArticles(columnId, cookies, { size = 500, all = false, logger } = {}) {
  return paginate('time.geekbang.org', '/serv/v1/column/articles', {
    cookies,
    all,
    logger,
    makeBody: (prev) => ({ cid: columnId, size, prev, order: 'earliest', sample: false }),
    extract: (data) => (data.data && data.data.list) || [],
  });
}

/** 获取文章详情（接口原始 data 对象） */
async function getArticleDetail(articleId, cookies) {
  const data = await apiCall('time.geekbang.org', '/serv/v1/article', {
    cookies,
    body: { id: Number(articleId), include_neighbors: true, is_freelyread: true },
  });
  return data.data || {};
}

module.exports = {
  UA,
  buildCookieHeader,
  requestJson,
  apiCall,
  getCourses,
  getColumnArticles,
  getArticleDetail,
};
