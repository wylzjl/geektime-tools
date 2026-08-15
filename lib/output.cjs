'use strict';

const fs = require('fs');
const path = require('path');

/** 文件名消毒：替换非法字符，去首尾空白/点，限制长度 */
function sanitizeFilename(name) {
  let safe = String(name || '')
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 120);
  return safe || 'untitled';
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 按格式解析输出目录：--out 为基目录，实际落到 <base>/html|md|text */
function resolveOutDir(base, format) {
  const sub = format === 'text' ? 'text' : format === 'md' ? 'md' : 'html';
  return path.resolve(base, sub);
}

function outputPathFor({ outDir, title, ext }) {
  return path.join(outDir, `${sanitizeFilename(title)}.${ext}`);
}

/** --resume 且文件已存在且未 --force 时跳过 */
function shouldSkip(filePath, { resume = false, force = false } = {}) {
  return resume && !force && fs.existsSync(filePath);
}

module.exports = { sanitizeFilename, ensureDir, resolveOutDir, outputPathFor, shouldSkip };
