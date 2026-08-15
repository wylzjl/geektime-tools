'use strict';

const { loadCredentials } = require('../lib/config.cjs');
const { ensureSession } = require('../lib/session.cjs');
const { getColumnArticles } = require('../lib/api.cjs');

/**
 * geektime articles <columnId> [--size N] [--all] [--json]
 * 列出专栏文章。
 */
async function run(options, logger) {
  const cred = loadCredentials({ configPath: options.config });
  const cookies = await ensureSession({
    phone: cred.phone,
    password: cred.password,
    cookiePath: options.cookies,
    logger,
  });
  const articles = await getColumnArticles(options.columnId, cookies, {
    size: options.size,
    all: options.all,
    logger,
  });

  if (options.json) {
    process.stdout.write(JSON.stringify(articles, null, 2) + '\n');
    return;
  }
  logger.info(`📄 专栏 ${options.columnId} 共 ${articles.length} 篇文章:`);
  articles.forEach((article, index) => {
    const title = article.article_title || article.title || '未命名文章';
    logger.info(`  ${index + 1}. ${title} (ID: ${article.id})`);
  });
}

module.exports = { run };
