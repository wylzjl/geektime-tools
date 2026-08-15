'use strict';

const fs = require('fs');
const { loadCredentials } = require('../lib/config.cjs');
const { ensureSession } = require('../lib/session.cjs');
const { fetchAndFormat } = require('../lib/pipeline.cjs');
const { withRetry } = require('../lib/pool.cjs');
const { ensureDir, resolveOutDir, outputPathFor } = require('../lib/output.cjs');
const { DEFAULT_DIST_DIR } = require('../lib/config.cjs');

/**
 * geektime fetch <articleId> [--mode api|browser] [--format html|md|text]
 *                  [--out <dir>] [--json]
 * 抓取单篇文章。
 */
async function run(options, logger) {
  const mode = options.mode || 'api';
  const format = options.format || 'html';

  // api 模式需要会话；browser 模式由 extract-article-browser.cjs 内部登录
  if (mode === 'api') {
    const cred = loadCredentials({ configPath: options.config });
    await ensureSession({
      phone: cred.phone,
      password: cred.password,
      cookiePath: options.cookies,
      logger,
    });
  } else {
    logger.info('🌐 浏览器模式提取（每篇约 4~12s，首次需在浏览器内登录）...');
  }

  const r = await withRetry(
    () =>
      fetchAndFormat(options.articleId, {
        mode,
        format,
        config: options.config,
        cookiePath: options.cookies,
        profileDir: options.profileDir,
        headless: options.headless,
      }),
    { retries: options.retries, logger, label: `文章 ${options.articleId}` }
  );

  const outDir = ensureDir(resolveOutDir(options.out || DEFAULT_DIST_DIR, format));
  const filePath = outputPathFor({ outDir, title: r.title, ext: r.ext });
  fs.writeFileSync(filePath, r.output, 'utf-8');

  if (options.json) {
    process.stdout.write(
      JSON.stringify({ id: r.id, title: r.title, file: filePath, chars: r.output.length }) + '\n'
    );
    return;
  }
  logger.info(`✅ ${r.title}\n   → ${filePath} (${r.output.length} 字符)`);
}

module.exports = { run };
