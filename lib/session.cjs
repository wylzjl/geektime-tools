'use strict';

const fs = require('fs');
const { requestJson, buildCookieHeader } = require('./api.cjs');
const { DEFAULT_COOKIES_PATH } = require('./config.cjs');

function loadCookies(cookiePath = DEFAULT_COOKIES_PATH) {
  if (!fs.existsSync(cookiePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
  } catch {
    return null;
  }
}

function saveCookies(cookies, cookiePath = DEFAULT_COOKIES_PATH) {
  fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2), 'utf-8');
  return cookiePath;
}

/** 判断是否持有有效会话（GCID + GCESS 大小写不敏感） */
function hasSession(cookies) {
  if (!cookies) return false;
  const keys = Object.keys(cookies).map((k) => k.toLowerCase());
  return keys.includes('gcid') && keys.includes('gcess');
}

/** 账号密码登录，从响应 Set-Cookie 提取会话 Cookie */
async function login(phone, password, logger) {
  const options = {
    hostname: 'account.geekbang.org',
    path: '/account/ticket/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://account.geekbang.org',
      Referer: 'https://account.geekbang.org/',
    },
  };

  const result = await requestJson(options.method, options.hostname, options.path, {
    headers: options.headers,
    body: {
      cellphone: phone,
      password,
      captcha: '',
      remember: 1,
      appid: 1,
      country: 86,
      platform: 3,
    },
  });

  if (result.statusCode !== 200) {
    throw new Error(`登录失败: HTTP ${result.statusCode}`);
  }

  const setCookie = result.headers['set-cookie'] || [];
  const cookies = {};
  setCookie.forEach((cookie) => {
    const parts = cookie.split(';')[0].split('=');
    if (parts.length === 2) cookies[parts[0].trim()] = parts[1].trim();
  });

  if (!hasSession(cookies)) {
    logger && logger.warn('未获取到完整 Cookie，可能登录失败');
    logger && logger.info('响应:', JSON.stringify(result.data, null, 2));
  }
  return cookies;
}

/**
 * 确保有可用会话：已有有效 Cookie 则复用，否则登录并保存。
 * @returns {Promise<object>} cookies
 */
async function ensureSession({ phone, password, cookiePath = DEFAULT_COOKIES_PATH, force = false, logger } = {}) {
  if (!force) {
    const existing = loadCookies(cookiePath);
    if (hasSession(existing)) {
      logger && logger.info(`📂 使用已保存的 Cookie: ${cookiePath}`);
      return existing;
    }
  }
  logger && logger.info(`📱 正在登录: ${phone}...`);
  const cookies = await login(phone, password, logger);
  const saved = saveCookies(cookies, cookiePath);
  logger && logger.info(`✅ 登录成功，Cookie 已保存到 ${saved}`);
  return cookies;
}

module.exports = { loadCookies, saveCookies, hasSession, login, ensureSession };
