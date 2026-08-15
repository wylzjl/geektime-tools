'use strict';

const cheerio = require('cheerio');

// ============ Slate 标记（浏览器渲染产物） ============

/** 内联文本：处理 bold/code/link 等 data-slate-type 标记 */
function getInlineText($, el) {
  let result = '';
  el.contents().each((i, node) => {
    if (node.type === 'text') {
      result += node.data;
    } else if (node.type === 'tag') {
      const $node = $(node);
      const type = $node.attr('data-slate-type');
      switch (type) {
        case 'bold':
          result += `**${$node.text()}**`;
          break;
        case 'code':
          result += `\`${$node.text()}\``;
          break;
        case 'link': {
          const href = $node.attr('href') || '#';
          result += `[${$node.text()}](${href})`;
          break;
        }
        default:
          result += $node.text();
      }
    }
  });
  return result.trim();
}

function processCodeBlock($, el) {
  const lang = el.attr('data-code-language') || '';
  const lines = [];
  el.find('[data-slate-type="code-line"]').each((i, line) => {
    const text = $(line).text().replace(/\s+$/, '');
    if (text || i === 0) lines.push(text);
  });
  return `\`\`\`${lang}\n${lines.join('\n')}\n\`\`\`\n\n`;
}

function processImage($, el) {
  const img = el.find('img');
  const src = img.attr('src') || '';
  const alt = img.attr('alt') || '图片';
  const caption = el.find('[data-slate-type="image-title"]').text().trim();
  let md = `![${caption || alt}](${src})\n\n`;
  if (caption) md += `*${caption}*\n\n`;
  return md;
}

function processList($, el) {
  let md = '';
  el.find('[data-slate-type="list-line"]').each((i, item) => {
    const text = getInlineText($, $(item));
    if (text) md += `- ${text}\n`;
  });
  return md + '\n';
}

function slateToMarkdown($, container) {
  let md = '';
  container.children().each((i, child) => {
    const $child = $(child);
    const type = $child.attr('data-slate-type');
    if (!type) return;

    switch (type) {
      case 'heading': {
        // tagName 为 H2/H3（大写），忽略大小写
        const level = parseInt($child.prop('tagName').replace(/^h/i, ''), 10) || 1;
        const text = getInlineText($, $child);
        if (text) md += `${'#'.repeat(level)} ${text}\n\n`;
        break;
      }
      case 'paragraph': {
        const text = getInlineText($, $child);
        if (text) md += `${text}\n\n`;
        break;
      }
      case 'pre':
        md += processCodeBlock($, $child);
        break;
      case 'list':
        md += processList($, $child);
        break;
      case 'image':
        md += processImage($, $child);
        break;
      default: {
        const text = $child.text().trim();
        if (text) md += `${text}\n\n`;
      }
    }
  });
  return md;
}

// ============ 普通 HTML（API 接口返回的 article_content 片段） ============

/** 内联普通 HTML → 行内 Markdown */
function inlinePlain($, el) {
  let out = '';
  el.contents().each((i, node) => {
    if (node.type === 'text') {
      out += node.data;
      return;
    }
    if (node.type !== 'tag') return;
    const $n = $(node);
    const tag = $n[0].tagName.toLowerCase();
    switch (tag) {
      case 'strong':
      case 'b':
        out += `**${inlinePlain($, $n)}**`;
        break;
      case 'em':
      case 'i':
        out += `*${inlinePlain($, $n)}*`;
        break;
      case 'code':
        out += `\`${$n.text()}\``;
        break;
      case 'a': {
        const href = $n.attr('href') || '#';
        out += `[${inlinePlain($, $n)}](${href})`;
        break;
      }
      case 'br':
        out += '\n';
        break;
      case 'img': {
        const src = $n.attr('src') || '';
        const alt = $n.attr('alt') || '图片';
        out += `![${alt}](${src})`;
        break;
      }
      default:
        out += inlinePlain($, $n);
    }
  });
  return out;
}

/** 块级普通 HTML → Markdown 块 */
function plainBlock($, el) {
  const tag = el[0].tagName.toLowerCase();
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = parseInt(tag[1], 10);
      const text = inlinePlain($, el).trim();
      return text ? `${'#'.repeat(level)} ${text}` : '';
    }
    case 'pre': {
      const code = el.find('code').first();
      const lang = (code.attr('class') || '').match(/language-([\w+-]+)/)?.[1] || '';
      return `\`\`\`${lang}\n${code.text().replace(/\s+$/, '')}\n\`\`\``;
    }
    case 'ul':
    case 'ol': {
      const items = [];
      el.children('li').each((i, li) => {
        const text = inlinePlain($, $(li)).trim();
        if (text) items.push(`${tag === 'ol' ? `${i + 1}.` : '-'} ${text}`);
      });
      return items.join('\n');
    }
    case 'blockquote': {
      const text = inlinePlain($, el).trim();
      return text ? `> ${text.replace(/\n/g, '\n> ')}` : '';
    }
    case 'img': {
      const src = el.attr('src') || '';
      const alt = el.attr('alt') || '图片';
      return `![${alt}](${src})`;
    }
    case 'hr':
      return '---';
    case 'p': {
      const text = inlinePlain($, el).trim();
      return text;
    }
    default: {
      // div 等容器：递归处理子块
      let out = '';
      el.children().each((i, child) => {
        if (child.type === 'tag') {
          const b = plainBlock($, $(child));
          if (b) out += b + '\n\n';
        }
      });
      return out.replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');
    }
  }
}

/**
 * 把极客时间文章 HTML 转 Markdown。
 * 自动识别两种输入：
 *   1. Slate 标记（浏览器渲染产物，含 data-slate-type）
 *   2. 普通 HTML 片段（API 接口返回的 article_content）
 * @param {string} html
 * @param {object} [opts]
 * @param {string} [opts.title] 已知标题（优先于从 html 提取）
 * @param {string} [opts.author] 已知作者
 * @param {string} [opts.description] 已知摘要
 * @param {string} [opts.fallbackTitle] 最终兜底标题（如文件名）
 */
function htmlToMarkdown(html, { title, author, description, fallbackTitle } = {}) {
  const $ = cheerio.load(html);

  const metaTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().replace(' - 极客时间', '') ||
    $('audio').attr('title') ||
    '';
  const finalTitle = title || metaTitle || fallbackTitle || '未命名文章';
  const finalAuthor = author || $('[class*="Index_articleInfo_"]').first().text().trim() || '';
  const finalDesc = description || $('meta[name="description"]').attr('content') || '';

  $('script,style').remove();

  const $editor = $('[data-slate-editor="true"]');
  const hasSlate = $editor.length > 0 || $('[data-slate-type]').length > 0;

  let mdContent;
  if (hasSlate) {
    const container = $editor.length ? $editor : $('body');
    mdContent = slateToMarkdown($, container);
  } else {
    mdContent = '';
    $('body')
      .children()
      .each((i, child) => {
        if (child.type !== 'tag') return;
        const block = plainBlock($, $(child));
        if (block) mdContent += block + '\n\n';
      });
  }

  mdContent = mdContent.replace(/\n{3,}/g, '\n\n');

  return `# ${finalTitle}

**作者**：${finalAuthor}

${finalDesc ? `> ${finalDesc}\n\n` : ''}---

${mdContent}

---

*本文由 geektime CLI 自动转换，生成于 ${new Date().toLocaleString()}*
`;
}

/** HTML → 纯文本（用于 --format text 的 API 模式） */
function htmlToText(html) {
  const $ = cheerio.load(html);
  $('script,style').remove();
  return $('body').text().replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

module.exports = { htmlToMarkdown, htmlToText };
