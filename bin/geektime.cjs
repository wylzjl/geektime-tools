#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const { createLogger } = require('../lib/logger.cjs');
const { DEFAULT_DIST_DIR } = require('../lib/config.cjs');

const program = new Command();

program
  .name('geektime')
  .description('极客时间内容抓取 CLI：登录、课程、专栏文章、抓取与转换')
  .version(require('../package.json').version, '-v, --version', '输出版本号')
  .option('--config <path>', '.env 配置文件路径（默认项目根目录 .env）')
  .option('--cookies <path>', 'cookies.json 路径（默认项目根目录 cookies.json）')
  .option('--json', '以 JSON 输出结果（日志改写到 stderr）')
  .option('--quiet', '静默模式（只输出错误）')
  .option('--verbose', '输出调试日志');

program
  .command('login')
  .description('登录并保存会话 Cookie')
  .option('--force', '强制重新登录（忽略已有 Cookie）')
  .action((opts) => dispatch('login', opts));

program
  .command('courses')
  .description('列出已购课程')
  .option('--size <n>', '每页数量', parseInt, 20)
  .option('--all', '分页拉取全部课程（默认只取一页）')
  .action((opts) => dispatch('courses', opts));

program
  .command('articles')
  .description('列出专栏文章')
  .argument('<columnId>', '专栏 ID')
  .option('--size <n>', '每页数量', parseInt, 500)
  .option('--all', '分页拉取全部文章（默认只取一页）')
  .action((columnId, opts) => dispatch('articles', { ...opts, columnId }));

program
  .command('fetch')
  .description('抓取单篇文章')
  .argument('<articleId>', '文章 ID')
  .option('--mode <mode>', '提取方式: api（快）| browser（慢但完整）', 'api')
  .option('--format <format>', '输出格式: html | md | text', 'html')
  .option('--out <dir>', `输出基目录（默认 ${DEFAULT_DIST_DIR}，文件落到 <base>/html|md|text）`)
  .option('--profile-dir <dir>', '浏览器持久化 profile 目录（browser 模式）')
  .option('--no-headless', '显示浏览器窗口（browser 模式）')
  .option('--retries <n>', '失败重试次数', parseInt, 2)
  .action((articleId, opts) => dispatch('fetch', { ...opts, articleId }));

program
  .command('sync')
  .description('同步整个专栏的文章')
  .argument('<columnId>', '专栏 ID')
  .option('--mode <mode>', '提取方式: api（快）| browser（慢但完整）', 'api')
  .option('--format <format>', '输出格式: html | md | text', 'html')
  .option('--out <dir>', `输出基目录（默认 ${DEFAULT_DIST_DIR}，文件落到 <base>/html|md|text）`)
  .option('--size <n>', '文章列表每页数量', parseInt, 500)
  .option('--all', '分页拉取全部文章列表（默认只取一页）')
  .option('--limit <n>', '最多抓取篇数（默认全部）', parseInt)
  .option('--concurrency <n>', '并发抓取数', parseInt, 3)
  .option('--resume', '跳过已存在的输出文件（断点续传）')
  .option('--force', '覆盖已存在的输出文件')
  .option('--profile-dir <dir>', '浏览器持久化 profile 目录（browser 模式）')
  .option('--no-headless', '显示浏览器窗口（browser 模式）')
  .option('--retries <n>', '每篇失败重试次数', parseInt, 2)
  .action((columnId, opts) => dispatch('sync', { ...opts, columnId }));

program
  .command('convert')
  .description('批量转换 HTML → Markdown')
  .argument('[htmlDir]', `HTML 目录（默认 ${DEFAULT_DIST_DIR}/html）`)
  .option('--out <dir>', `Markdown 输出目录（默认 ${DEFAULT_DIST_DIR}/md）`)
  .action((htmlDir, opts) => dispatch('convert', { ...opts, htmlDir }));

/** 命令分发：合并全局选项，加载对应命令模块并执行 */
async function dispatch(name, opts) {
  const globals = program.opts();
  const logger = createLogger({
    quiet: globals.quiet,
    verbose: globals.verbose,
    json: globals.json,
  });
  try {
    const mod = require(`../commands/${name}.cjs`);
    await mod.run({ ...globals, ...opts }, logger);
  } catch (err) {
    logger.error(err && err.message ? err.message : String(err));
    process.exitCode = 1;
  }
}

program.parse(process.argv);
