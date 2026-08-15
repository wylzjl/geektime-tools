// extract-article-api.cjs
// 方案 1：直接调用极客时间 SPA 底层的 JSON 数据接口提取文章正文。
//
// 背景：文章页 `https://time.geekbang.org/column/article/{id}` 是 Vue 单页应用，
// 服务端只返回空壳 HTML，正文由前端再调接口渲染。本脚本直接调正文接口，
// 拿到 `data.article_content`（带 `<p>/<h2>/<ul>/<pre>` 等语义标记的 HTML 片段）。
//
// 依赖：无第三方依赖（仅 Node 内置模块）。
// 用法：
//   node -e "require('./extract-article-api.cjs').fetchArticle(1005603).then(r=>console.log(r.title, r.content.length))"
//
// 返回的 metadata 为接口原始 data 对象，含标题/作者/发布时间/音频/封面等字段，
// 其中 audio_download_url 可用于下载配套音频。

const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULT_HOST = 'time.geekbang.org';
const ARTICLE_API_PATH = '/serv/v1/article';

// ============ Cookie ============

function loadCookies(cookiePath) {
  const resolved = cookiePath || path.join(__dirname, 'cookies.json');
  if (!fs.existsSync(resolved)) {
    throw new Error(`Cookie 文件不存在: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf-8'));
}

function buildCookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

// ============ HTTP ============

function requestJson(method, hostname, pathname, { cookieHeader, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: pathname,
        method,
        headers: {
          Cookie: cookieHeader,
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Content-Type': 'application/json',
          // 缺 Origin/Referer 会被 WAF 判定为爬虫并返回 HTTP 451
          Origin: 'https://time.geekbang.org',
          Referer: 'https://time.geekbang.org/',
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ statusCode: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ============ 主函数 ============

/**
 * 通过极客时间文章数据接口抓取文章正文。
 * @param {number|string} articleId 文章 id（与专栏文章列表返回的 id 一致）
 * @param {object} [options]
 * @param {string} [options.cookiePath] cookies.json 路径，默认取本文件同目录
 * @param {string} [options.host] 覆盖接口域名（一般无需设置）
 * @returns {Promise<{
 *   articleId: number,
 *   title: string,
 *   author: string,
 *   ctime: number|undefined,
 *   content: string,
 *   contentType: 'text/html',
 *   metadata: object
 * }>}
 */
async function fetchArticle(articleId, options = {}) {
  const cookies = loadCookies(options.cookiePath);
  const cookieHeader = buildCookieHeader(cookies);

  const result = await requestJson(
    'POST',
    options.host || DEFAULT_HOST,
    ARTICLE_API_PATH,
    { cookieHeader, body: { id: Number(articleId) } }
  );

  if (result.statusCode !== 200) {
    throw new Error(`抓取失败: HTTP ${result.statusCode}`);
  }
  const body = result.data;
  if (!body || body.code !== 0) {
    throw new Error(`接口返回错误: code=${body?.code}, msg=${body?.msg || '未知错误'}`);
  }

  const d = body.data || {};
  return {
    articleId: d.id,
    title: d.article_title,
    author: d.author_name,
    ctime: d.article_ctime,
    content: d.article_content,
    contentType: 'text/html',
    metadata: d,
  };
}

module.exports = { fetchArticle, loadCookies };
