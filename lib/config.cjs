'use strict';

const fs = require('fs');
const path = require('path');

// 默认路径基于“运行命令时的当前目录”：包被全局安装（npm i -g）后，
// 包目录本身不可写，凭证 / Cookie / 输出都应落到用户运行命令的地方。
const DEFAULT_ENV_PATH = path.join(process.cwd(), '.env');
const DEFAULT_COOKIES_PATH = path.join(process.cwd(), 'cookies.json');
const DEFAULT_PROFILE_DIR = path.join(process.cwd(), '.browser-profile');
const DEFAULT_DIST_DIR = path.join(process.cwd(), 'dist');

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

/** 加载登录凭证（--config 覆盖，默认当前目录 .env） */
function loadCredentials({ configPath } = {}) {
  const resolved = configPath || DEFAULT_ENV_PATH;
  const config = parseDotEnv(resolved);
  if (!config.phone || !config.password) {
    throw new Error(`配置文件 ${resolved} 缺少 phone 或 password 字段`);
  }
  return { phone: config.phone, password: config.password, configPath: resolved };
}

module.exports = {
  DEFAULT_ENV_PATH,
  DEFAULT_COOKIES_PATH,
  DEFAULT_PROFILE_DIR,
  DEFAULT_DIST_DIR,
  parseDotEnv,
  loadCredentials,
};
