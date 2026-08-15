'use strict';

const fs = require('fs');
const path = require('path');
const { htmlToMarkdown } = require('../lib/convert.cjs');
const { ensureDir } = require('../lib/output.cjs');
const { DEFAULT_DIST_DIR } = require('../lib/config.cjs');

/**
 * geektime convert [htmlDir] [--out mdDir] [--json]
 * 批量把 HTML 转 Markdown（默认 dist/html → dist/md）。
 */
async function run(options, logger) {
  const htmlDir = path.resolve(options.htmlDir || path.join(DEFAULT_DIST_DIR, 'html'));
  const mdDir = path.resolve(options.out || path.join(DEFAULT_DIST_DIR, 'md'));

  if (!fs.existsSync(htmlDir)) {
    logger.error(`目录不存在：${htmlDir}`);
    process.exitCode = 1;
    return;
  }
  ensureDir(mdDir);

  const files = fs
    .readdirSync(htmlDir)
    .filter((f) => f.toLowerCase().endsWith('.html'))
    .sort();

  if (!files.length) {
    logger.warn('未找到任何 .html 文件');
    return;
  }
  logger.info(`📂 发现 ${files.length} 个 HTML 文件，开始转换...`);

  const results = [];
  let ok = 0;
  let failed = 0;
  for (const file of files) {
    const inputPath = path.join(htmlDir, file);
    const outputName = file.replace(/\.html$/i, '.md');
    const outputPath = path.join(mdDir, outputName);
    try {
      const html = fs.readFileSync(inputPath, 'utf-8');
      const md = htmlToMarkdown(html, { fallbackTitle: outputName.replace(/\.md$/, '') });
      fs.writeFileSync(outputPath, md, 'utf-8');
      ok++;
      results.push({ input: file, output: outputName, status: 'ok' });
    } catch (e) {
      failed++;
      logger.error(`转换失败：${file} → ${e.message}`);
      results.push({ input: file, status: 'failed', error: e.message });
    }
  }

  if (options.json) {
    process.stdout.write(JSON.stringify({ total: files.length, ok, failed, results }, null, 2) + '\n');
  } else {
    logger.info(`📊 转换完成：成功 ${ok}，失败 ${failed}`);
    logger.info(`📁 输出目录：${mdDir}`);
  }
  if (failed > 0) process.exitCode = 1;
}

module.exports = { run };
