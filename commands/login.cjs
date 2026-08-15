'use strict';

const { loadCredentials } = require('../lib/config.cjs');
const { ensureSession } = require('../lib/session.cjs');

/**
 * geektime login [--force]
 * 登录并保存会话 Cookie 到 cookies.json（默认项目根目录）。
 */
async function run(options, logger) {
  const cred = loadCredentials({ configPath: options.config });
  const cookies = await ensureSession({
    phone: cred.phone,
    password: cred.password,
    cookiePath: options.cookies,
    force: options.force,
    logger,
  });
  if (options.json) {
    process.stdout.write(JSON.stringify({ ok: true, cookiePath: options.cookies }) + '\n');
  } else {
    logger.info(`✅ 会话就绪（Cookie 数量: ${Object.keys(cookies).length}）`);
  }
}

module.exports = { run };
