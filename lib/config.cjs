'use strict';

const fs = require('fs');
const path = require('path');

// 项目根目录 = geektime-tools/（本文件位于 geektime-tools/lib/）
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ENV_PATH = path.join(PROJECT_ROOT, '.env');
const DEFAULT_COOKIES_PATH = path.join(PROJECT_ROOT, 'cookies.json');
const DEFAULT_PROFILE_DIR = path.join(PROJECT_ROOT, '.browser-profile');
const DEFAULT_DIST_DIR = path.join(PROJECT_ROOT, 'dist');

/** 解析 .env（key=value 每行一个） */
function parseDotEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    throw new Error(
      `配置文件 ${envPath} 不存在！请创建并填入:\nphone=你的手机号\npassword=你的密码`
    );
  }
  const config = {};
  fs.readFileSync(envPath, 'utf-8')
    .split('\n')
    .forEach((line) => {
      const [key, value] = line.split('=');
      if (key && value) config[key.trim()] = value.trim();
    });
  return config;
}

/** 加载登录凭证（--config 覆盖，默认项目根目录 .env） */
function loadCredentials({ configPath } = {}) {
  const resolved = configPath || DEFAULT_ENV_PATH;
  const config = parseDotEnv(resolved);
  if (!config.phone || !config.password) {
    throw new Error(`配置文件 ${resolved} 缺少 phone 或 password 字段`);
  }
  return { phone: config.phone, password: config.password, configPath: resolved };
}

module.exports = {
  PROJECT_ROOT,
  DEFAULT_ENV_PATH,
  DEFAULT_COOKIES_PATH,
  DEFAULT_PROFILE_DIR,
  DEFAULT_DIST_DIR,
  parseDotEnv,
  loadCredentials,
};
