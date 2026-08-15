'use strict';

const { fetchArticle } = require('./extract-api.cjs');
const { extractArticle } = require('./extract-browser.cjs');
const { htmlToMarkdown, htmlToText } = require('./convert.cjs');
const fs = require('fs');

/**
 * 抓取单篇文章并按目标格式转换，返回写盘所需的统一结构。
 * @param {number|string} articleId
 * @param {object} [options]
 * @param {'api'|'browser'} [options.mode='api']
 * @param {'html'|'md'|'text'} [options.format='html']
 * @param {string} [options.config] .env 路径（browser 模式登录用）
 * @param {string} [options.cookiePath] cookies.json 路径（api 模式用）
 * @param {string} [options.profileDir] 浏览器持久化 profile 目录
 * @param {boolean} [options.headless]
 * @returns {Promise<{id:number, title:string, author:string, output:string, ext:string}>}
 */
async function fetchAndFormat(articleId, { mode = 'api', format = 'html', config, cookiePath, profileDir, headless } = {}) {
  if (mode === 'browser') {
    const r = await extractArticle(articleId, {
      envPath: config,
      mode: format === 'text' ? 'text' : 'html',
      profileDir,
      headless,
    });
    let output = r.content;
    if (format === 'md') output = htmlToMarkdown(r.content, { title: r.title });
    return { id: r.articleId, title: r.title, author: r.author || '', output, ext: format === 'text' ? 'txt' : format };
  }

  // api 模式
  const r = await fetchArticle(articleId, { cookiePath });
  fs.writeFileSync(`./dist/html/${r.title}.html`, r.content, 'utf-8');
  let output;
  if (format === 'text') output = htmlToText(r.content);
  else if (format === 'md') output = htmlToMarkdown(r.content, { title: r.title, author: r.author });
  else output = r.content;
  return { id: r.articleId, title: r.title, author: r.author || '', output, ext: format === 'text' ? 'txt' : format };
}

module.exports = { fetchAndFormat };
