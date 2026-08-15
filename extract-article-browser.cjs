// extract-article-browser.cjs
// 方案 2：用无头浏览器打开文章页，等正文渲染完成后再提取——拿到"最终渲染产物"。
//
// 与方案 1（JSON 接口）的区别：
//   - 页面里由 JS 渲染的正文（含 Slate 富文本标记 data-slate-type、代码高亮、
//     懒加载图片等）会被真实渲染出来；
//   - 默认 mode='html' 提取正文容器的 innerHTML，带 data-slate-type 标记，
//     可直接喂给你已有的 convert.cjs 转 Markdown；
//   - 代价是需要浏览器进程，速度较慢（单篇约 4~12s）。
//
// ⚠️ 登录方式说明：
//   极客时间把会话 Cookie（acw_tc / GCID / GCESS 等）绑定到客户端的 TLS 指纹，
//   直接用 cookies.json 里的值注入浏览器会失效（返回"用户未购买此专栏"的预览版）。
//   因此本实现会在浏览器内用 .env 的账号密码重新登录，拿到绑定 Chrome 指纹的会话。
//   另外两个关键点：
//   1) 登录后会把会话 Cookie 强制附加到所有请求头（forceSessionCookieHeader），
//      因为文章页在登录态识别异常时，正文 XHR 可能不带任何 Cookie 而退化成预览版；
//   2) 默认复用持久化的浏览器 profile（.browser-profile/），第 2 次及以后直接复用
//      已有登录会话、不重复登录——极客时间对短时间内连续登录会判定为可疑，
//      新会话在正文接口上可能仍只给预览版。
//
// 前置：使用系统已安装的 Google Chrome（无需 `playwright install` 下载浏览器）。
//   安装依赖：pnpm add playwright
//   账号配置：项目根目录 .env（phone=手机号 / password=密码）
// 用法：
//   node -e "require('./extract-article-browser.cjs').extractArticle(1005603).then(r=>console.log(r.title, r.content.length))"

const fs = require('fs');
const path = require('path');

// 惰性加载 playwright：未安装时给出清晰提示，而不是 module 加载即报错
let _chromium = null;
function getChromium() {
  if (_chromium) return _chromium;
  try {
    ({ chromium: _chromium } = require('playwright'));
    return _chromium;
  } catch {
    throw new Error(
      '未安装 playwright，请先执行: pnpm add playwright（本实现使用系统 Chrome，无需再执行 pnpm exec playwright install）'
    );
  }
}

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 正文渲染完成的判定选择器（slate 段落/标题，或正文容器）
const CONTENT_READY_SELECTOR =
  '[data-slate-type="paragraph"], [data-slate-type="heading"], [class*="articleContent"]';

// 默认持久化 profile 目录：第 2 次起复用登录会话
const DEFAULT_PROFILE_DIR = path.join(__dirname, '.browser-profile');

// ============ 配置 ============

function loadEnvCredentials(envPath) {
  const resolved = envPath || path.join(__dirname, '.env');
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `配置文件 ${resolved} 不存在！请创建并填入:\nphone=你的手机号\npassword=你的密码`
    );
  }
  const config = {};
  fs.readFileSync(resolved, 'utf-8').split('\n').forEach((line) => {
    const [key, value] = line.split('=');
    if (key && value) config[key.trim()] = value.trim();
  });
  if (!config.phone || !config.password) {
    throw new Error('配置文件缺少 phone 或 password 字段');
  }
  return { phone: config.phone, password: config.password };
}

// ============ 浏览器内登录 ============

/**
 * 在浏览器上下文里完成登录（与 account.geekbang.org 同源 fetch 登录），
 * 使会话 Cookie 绑定到 Chrome 的 TLS 指纹。
 * @param {import('playwright').Page} page 已打开 account.geekbang.org 的页面
 * @returns {Promise<void>}
 */
async function loginInBrowser(page, { phone, password }) {
  const result = await page.evaluate(
    async ({ phone, password }) => {
      const r = await fetch('/account/ticket/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cellphone: phone,
          password,
          captcha: '',
          remember: 1,
          appid: 1,
          country: 86,
          platform: 3,
        }),
      });
      const j = await r.json();
      return { status: r.status, code: j.code, msg: j.msg || j.error?.msg };
    },
    { phone, password }
  );
  console.log(`🔑 浏览器内登录结果: status=${result.status}, code=${result.code}, msg=${result.msg || '无'}`);
  if (result.code !== 0) {
    throw new Error(`浏览器内登录失败: code=${result.code}, msg=${result.msg || '未知错误'}`);
  }
}

// ============ 会话 Cookie 强化 ============

/**
 * 把浏览器当前会话 Cookie 强制附加到所有请求的 Cookie 头。
 * 背景：文章页在登录态识别异常时，正文 XHR 可能完全不带 Cookie，
 * 导致接口返回"用户未购买此专栏"的预览版。setExtraHTTPHeaders 可强制带上，
 * 使同一份（绑定 Chrome 指纹的）会话 Cookie 被正文接口认可。
 */
async function forceSessionCookieHeader(context) {
  const cookies = await context.cookies('https://time.geekbang.org/');
  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  if (cookieStr) {
    await context.setExtraHTTPHeaders({ Cookie: cookieStr });
  }
  return cookieStr;
}

// ============ 页面操作 ============

/**
 * 在页面内滚动到底部，触发懒加载的正文段落/图片渲染。
 * 极客时间文章页是固定高度布局，正文在一个 SimpleBar 容器内滚动，
 * 所以除了 window 还要滚动 .simplebar-content-wrapper。
 */
function scrollToTriggerLazyLoad(page, maxScrolls = 30) {
  return page.evaluate((maxScrolls) => {
    return new Promise((resolve) => {
      const delay = (ms) => new Promise((r) => setTimeout(r, ms));
      let prevTotal = 0;
      let i = 0;
      const tick = async () => {
        // 同时滚动 window 和所有 SimpleBar 容器
        window.scrollTo(0, document.body.scrollHeight);
        document.querySelectorAll('.simplebar-content-wrapper').forEach((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await delay(200);
        const total = document.body.scrollHeight + Array.from(document.querySelectorAll('.simplebar-content-wrapper')).reduce((s, el) => s + el.scrollHeight, 0);
        if (total === prevTotal || ++i >= maxScrolls) return resolve();
        prevTotal = total;
        return tick();
      };
      tick();
    });
  }, maxScrolls);
}

/** 检测文章页是否为"未登录/未购买"的预览版（预览版含"立即购买"按钮且段落很少） */
async function isPreview(page) {
  return page.evaluate(() => {
    const c = document.querySelector('[class*="articleContent"]');
    const text = c ? c.innerText : '';
    return {
      hasBuyBtn: /立即购买/.test(text),
      paraCount: c ? c.querySelectorAll('[data-slate-type="paragraph"]').length : 0,
    };
  });
}

/**
 * 导航到文章页、等待渲染并提取。若落在预览版则返回 null。
 */
async function loadArticle(page, articleId, options) {
  const mode = options.mode || 'html';
  const url = `https://time.geekbang.org/column/article/${articleId}`;
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: options.waitTimeout ?? 30000,
  });
  await page.waitForSelector(CONTENT_READY_SELECTOR, {
    timeout: options.waitTimeout ?? 30000,
  });
  await scrollToTriggerLazyLoad(page, options.maxScrolls ?? 30);
  await page.waitForLoadState('networkidle').catch(() => {});

  const preview = await isPreview(page);
  if (preview.hasBuyBtn || preview.paraCount < 2) return null;

  const extracted = await page.evaluate((mode) => {
    const container =
      // document.querySelector('[class*="articleContent"]') ||
      document.querySelector("#article-content-container") ||
      document.querySelector('#app');
    const title =
      document.querySelector('meta[property="og:title"]')?.content ||
      document.querySelector('title')?.textContent ||
      '';
    let content = '';
    if (mode === 'text') {
      content = container ? container.innerText : document.body.innerText;
    } else if (mode === 'full') {
      content = document.documentElement.outerHTML;
    } else {
      content = container
        ? container.innerHTML
        : document.getElementById('app')?.innerHTML || '';
    }
    return { title, content };
  }, mode);

  return {
    articleId: Number(articleId),
    title: extracted.title,
    url,
    mode,
    contentType: mode === 'text' ? 'text/plain' : 'text/html',
    content: extracted.content,
    statusCode: response ? response.status() : null,
  };
}

// ============ 主函数 ============

/**
 * 用无头浏览器打开文章页，登录并等待正文渲染后提取。
 *
 * 默认复用持久化 profile（options.profileDir，默认 .browser-profile/）：
 *   - 第 1 次：空 profile → 检测到预览版 → 浏览器内登录 → 强制附加会话 Cookie → 重试；
 *   - 第 2 次起：直接复用已有登录会话，无需重复登录，避免连续登录被判可疑。
 *
 * @param {number|string} articleId 文章 id（与 URL `/column/article/{id}` 一致）
 * @param {object} [options]
 * @param {object} [options.credentials] 覆盖登录账号 {phone, password}；缺省读 .env
 * @param {string} [options.envPath] .env 路径，默认取本文件同目录
 * @param {string|false} [options.profileDir] 持久化 profile 目录；传 false 则每次全新会话
 * @param {'html'|'text'|'full'} [options.mode='html']
 *   html: 正文容器 innerHTML（Slate 渲染结果，含 data-slate-type）
 *   text: 正文容器纯文本
 *   full: 整页渲染后的完整 HTML（document.documentElement.outerHTML）
 * @param {boolean} [options.headless=true] 设为 false 可观察浏览器执行过程
 * @param {number} [options.waitTimeout=30000] 等待正文渲染的超时（毫秒）
 * @param {number} [options.maxScrolls=30] 自动滚动最大次数（触发懒加载）
 * @returns {Promise<{
 *   articleId: number,
 *   title: string,
 *   url: string,
 *   mode: string,
 *   content: string,
 *   contentType: 'text/html'|'text/plain',
 *   statusCode: number|null
 * }>}
 */
async function extractArticle(articleId, options = {}) {
  const credentials = options.credentials || loadEnvCredentials(options.envPath);
  const chromium = getChromium();
  const persistent = options.profileDir !== false;
  const profileDir = options.profileDir || DEFAULT_PROFILE_DIR;

  const launchOptions = {
    channel: 'chrome', // 复用系统已安装的 Google Chrome，免下载浏览器
    headless: options.headless !== false,
    args: ['--disable-blink-features=AutomationControlled'],
    userAgent: DESKTOP_UA,
    viewport: { width: 1280, height: 800 },
  };

  let context = null;
  try {
    if (persistent) {
      // launchPersistentContext 返回的就是 BrowserContext；profile 目录即登录会话的持久化位置
      context = await chromium.launchPersistentContext(profileDir, launchOptions);
    } else {
      const browser = await chromium.launch(launchOptions);
      context = await browser.newContext(launchOptions);
    }
    const page = context.pages()[0] || (await context.newPage());

    // 1. 先强制附加会话 Cookie 头（无会话时自动跳过），再尝试复用已有会话（第 2 次起命中，无需登录）
    await forceSessionCookieHeader(context);
    let result = await loadArticle(page, articleId, options);
    if (result) return result;

    // 2. 命中预览版 → 登录 → 强制携带会话 Cookie → 重试
    await page.goto('https://account.geekbang.org/', {
      waitUntil: 'domcontentloaded',
      timeout: options.waitTimeout ?? 30000,
    });
    await loginInBrowser(page, credentials);
    console.log('🔑 浏览器内登录完成');
    await forceSessionCookieHeader(context);

    result = await loadArticle(page, articleId, options);
    if (result) return result;

    throw new Error(
      '登录后文章页仍为预览版（登录态异常）。请检查 .env 账号是否有权限阅读该专栏；' +
        '若刚连续登录过，可稍等 1~2 分钟或删除 .browser-profile/ 目录后重试。'
    );
  } finally {
    if (context) await context.close();
  }
}

module.exports = { extractArticle, loadEnvCredentials, loginInBrowser, forceSessionCookieHeader };
