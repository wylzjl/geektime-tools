'use strict';

const fs = require('fs');
const path = require('path');
const { loadCredentials } = require('../lib/config.cjs');
const { ensureSession } = require('../lib/session.cjs');
const { getColumnArticles } = require('../lib/api.cjs');
const { fetchAndFormat } = require('../lib/pipeline.cjs');
const { mapLimit, withRetry } = require('../lib/pool.cjs');
const { ensureDir, resolveOutDir, outputPathFor, shouldSkip } = require('../lib/output.cjs');
const { DEFAULT_DIST_DIR } = require('../lib/config.cjs');

/**
 * geektime sync <columnId> [--mode api|browser] [--format html|md|text]
 *                  [--out <dir>] [--size N] [--all] [--limit N]
 *                  [--concurrency N] [--resume] [--force] [--json]
 * 同步整个专栏：先拉文章列表，再并发抓取每篇正文。
 */
async function run(options, logger) {
  const mode = options.mode || 'api';
  const format = options.format || 'html';
  const outDir = ensureDir(resolveOutDir(options.out || DEFAULT_DIST_DIR, format));

  // 文章列表接口始终需要 Node 会话（浏览器模式只影响正文提取）
  const cred = loadCredentials({ configPath: options.config });
  const cookies = await ensureSession({
    phone: cred.phone,
    password: cred.password,
    cookiePath: options.cookies,
    logger,
  });

  logger.info(`📄 正在获取专栏 ${options.columnId} 的文章列表...`);
  const articles = await getColumnArticles(options.columnId, cookies, {
    size: options.size,
    all: options.all,
    logger,
  });
  const targets = options.limit ? articles.slice(0, options.limit) : articles;
  logger.info(
    `✅ 共 ${articles.length} 篇，本次同步 ${targets.length} 篇 (mode=${mode}, format=${format}, 并发=${options.concurrency})`
  );

  const results = await mapLimit(targets, options.concurrency, async (article, index) => {
    const id = article.id;
    const title = article.article_title || article.title || String(id);
    const filePath = outputPathFor({ outDir, title, ext: format === 'text' ? 'txt' : format });

    if (shouldSkip(filePath, options)) {
      logger.info(`⏭️  (${index + 1}/${targets.length}) 已存在，跳过: ${title}`);
      return { id, title, status: 'skipped', file: filePath };
    }

    try {
      const r = await withRetry(
        () =>
          fetchAndFormat(id, {
            mode,
            format,
            config: options.config,
            cookiePath: options.cookies,
            profileDir: options.profileDir,
            headless: options.headless,
          }),
        { retries: options.retries, logger, label: `文章 ${id}` }
      );
      fs.writeFileSync(filePath, r.output, 'utf-8');
      logger.info(`✅ (${index + 1}/${targets.length}) ${title}\n   → ${path.basename(filePath)} (${r.output.length} 字符)`);
      return { id, title, status: 'ok', file: filePath, chars: r.output.length };
    } catch (err) {
      logger.error(`(${index + 1}/${targets.length}) ${title} 失败: ${err.message}`);
      return { id, title, status: 'failed', error: err.message };
    }
  });

  const ok = results.filter((r) => r.status === 'ok').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  if (options.json) {
    process.stdout.write(
      JSON.stringify({ total: targets.length, ok, skipped, failed, results }, null, 2) + '\n'
    );
  } else {
    logger.info(`\n📊 同步完成：成功 ${ok}，跳过 ${skipped}，失败 ${failed}，共 ${targets.length}`);
    logger.info(`📁 输出目录：${outDir}`);
  }
  if (failed > 0) process.exitCode = 1;
}

module.exports = { run };
