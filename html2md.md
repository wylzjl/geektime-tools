我来帮你分析如何通过脚本将这个 HTML 页面转换成清晰、结构化的 Markdown 文档。

## 📄 页面结构分析

这个页面是极客时间的一篇课程文章，核心内容位于：

```html
<div data-slate-editor="true" ...>
  <!-- 文章主体内容 -->
</div>
```

### 关键元素识别

| 元素类型 | 标识方式 | 示例 |
|---------|---------|------|
| 标题 | `<h2 data-slate-type="heading">` | `19｜扩展：ChatPanel...` |
| 段落 | `<div data-slate-type="paragraph">` | 普通文本段落 |
| 代码块 | `<div data-slate-type="pre">` | 带语言标记的代码 |
| 代码行 | `<div data-slate-type="code-line">` | 单行代码 |
| 列表 | `<div data-slate-type="list">` | 有序/无序列表 |
| 列表项 | `<div data-slate-type="list-line">` | 列表中的一项 |
| 图片 | `<div data-slate-type="image">` + `<img>` | 文章配图 |
| 粗体 | `[data-slate-type="bold"]` | 加粗文本 |
| 行内代码 | `[data-slate-type="code"]` | `const` |
| 链接 | `[data-slate-type="link"]` | 超链接 |

## 🛠️ 转换脚本设计

### 方案一：Node.js + Cheerio（推荐）

```javascript
const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');

// 1. 读取 HTML 文件
const html = fs.readFileSync('page.html', 'utf-8');
const $ = cheerio.load(html);

// 2. 提取元数据
const title = $('meta[property="og:title"]').attr('content') || 
              $('title').text();
const description = $('meta[name="description"]').attr('content') || '';
const author = $('.Index_columnName_7xLcq').first().text().trim();

// 3. 提取正文（核心部分）
const $editor = $('[data-slate-editor="true"]');

// 4. 遍历并转换
let markdown = '';

// --- 辅助函数 ---

// 处理文本节点，保留粗体、行内代码等
function processInline(el) {
  let text = '';
  el.children().each((i, child) => {
    const $child = $(child);
    if (child.type === 'text') {
      text += child.data;
    } else if ($child.attr('data-slate-type') === 'bold') {
      text += `**${$child.text()}**`;
    } else if ($child.attr('data-slate-type') === 'code') {
      text += `\`${$child.text()}\``;
    } else if ($child.attr('data-slate-type') === 'link') {
      const href = $child.attr('href') || '#';
      text += `[${$child.text()}](${href})`;
    } else {
      text += $child.text();
    }
  });
  return text;
}

// 处理代码块
function processCodeBlock(el) {
  const lang = el.attr('data-code-language') || '';
  const lines = [];
  el.find('[data-slate-type="code-line"]').each((i, line) => {
    const text = $(line).text().replace(/\s+$/, '');
    lines.push(text);
  });
  return `\`\`\`${lang}\n${lines.join('\n')}\n\`\`\`\n\n`;
}

// 处理列表
function processList(el) {
  let result = '';
  el.find('[data-slate-type="list-line"]').each((i, item) => {
    const text = processInline($(item));
    result += `- ${text}\n`;
  });
  return result + '\n';
}

// 处理图片
function processImage(el) {
  const img = el.find('img');
  const src = img.attr('src') || '';
  const alt = img.attr('alt') || '图片';
  const title = el.find('[data-slate-type="image-title"]').text() || '';
  return `![${alt}](${src})\n\n${title ? `*${title}*\n\n` : ''}`;
}

// --- 主遍历逻辑 ---

$editor.children().each((i, child) => {
  const $child = $(child);
  const type = $child.attr('data-slate-type');
  const obj = $child.attr('data-slate-object');

  switch (type) {
    case 'heading': {
      const level = $child.prop('tagName').replace('H', '');
      const text = processInline($child);
      markdown += `${'#'.repeat(level)} ${text}\n\n`;
      break;
    }

    case 'paragraph': {
      const text = processInline($child).trim();
      if (text) markdown += `${text}\n\n`;
      break;
    }

    case 'pre': {
      markdown += processCodeBlock($child);
      break;
    }

    case 'list': {
      markdown += processList($child);
      break;
    }

    case 'image': {
      markdown += processImage($child);
      break;
    }

    case 'list-line': {
      // 如果父级不是 list，单独处理（通常不会发生）
      break;
    }

    default: {
      // 兜底：直接提取文本
      const text = $child.text().trim();
      if (text) markdown += `${text}\n\n`;
    }
  }
});

// 5. 组装最终 MD
const finalMD = `# ${title}

> ${description}

**作者**：${author}

---

${markdown}

---

*生成时间：${new Date().toLocaleString()}*
`;

// 6. 写入文件
fs.writeFileSync('output.md', finalMD, 'utf-8');
console.log('✅ 转换完成！');
```

### 方案二：Python + BeautifulSoup

```python
from bs4 import BeautifulSoup
import re

with open('page.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f, 'html.parser')

# 提取元数据
title = soup.find('meta', property='og:title')
title = title['content'] if title else ''

# 查找编辑器容器
editor = soup.find('div', {'data-slate-editor': 'true'})
if not editor:
    print('未找到内容区域')
    exit()

md_lines = []

def process_inline(el):
    """处理行内格式"""
    result = ''
    for child in el.children:
        if child.name is None:  # 文本节点
            result += str(child)
        elif child.name == 'span' and child.get('data-slate-type') == 'bold':
            result += f"**{child.get_text()}**"
        elif child.name == 'span' and child.get('data-slate-type') == 'code':
            result += f"`{child.get_text()}`"
        elif child.name == 'span' and child.get('data-slate-type') == 'link':
            href = child.get('href', '#')
            result += f"[{child.get_text()}]({href})"
        else:
            result += child.get_text()
    return result

def process_pre(el):
    """处理代码块"""
    lang = el.get('data-code-language', '')
    lines = []
    for line in el.find_all('div', {'data-slate-type': 'code-line'}):
        text = line.get_text().rstrip()
        lines.append(text)
    return f"```{lang}\n" + '\n'.join(lines) + "\n```\n\n"

# 遍历子元素
for child in editor.children:
    if child.name is None:
        continue
    
    type_ = child.get('data-slate-type')
    
    if type_ == 'heading':
        level = child.name.replace('h', '')
        text = process_inline(child).strip()
        md_lines.append(f"{'#' * int(level)} {text}\n")
    
    elif type_ == 'paragraph':
        text = process_inline(child).strip()
        if text:
            md_lines.append(f"{text}\n")
    
    elif type_ == 'pre':
        md_lines.append(process_pre(child))
    
    elif type_ == 'list':
        for item in child.find_all('div', {'data-slate-type': 'list-line'}):
            text = process_inline(item).strip()
            md_lines.append(f"- {text}\n")
        md_lines.append("")
    
    elif type_ == 'image':
        img = child.find('img')
        if img:
            src = img.get('src', '')
            alt = img.get('alt', '图片')
            md_lines.append(f"![{alt}]({src})\n")

# 保存
with open('output.md', 'w', encoding='utf-8') as f:
    f.write(f"# {title}\n\n")
    f.write(''.join(md_lines))

print('✅ 转换完成！')
```

## ⚙️ 针对特殊结构的处理策略

### 1. 代码行号处理

页面中的代码块带有行号标记（`data-code-line-number`），转换时需要**移除行号**，只保留代码内容：

```javascript
// 行号在伪元素中，实际文本不包含行号
// 直接取 .hljs-ln-line 的文本内容即可
```

### 2. 高亮代码（hljs）

代码块使用 `hljs` 高亮，有大量 `mark-class` 标记。转换时直接取**纯文本内容**，丢掉样式标记：

```javascript
// 直接取 text() 可获取纯代码文本
const code = $('[data-slate-type="code-line"]').text();
```

### 3. 图片处理

图片结构：
```html
<div data-slate-type="image">
  <img src="..." />
  <div data-slate-type="image-title">图片说明</div>
</div>
```

转换后：
```markdown
![图片说明](图片URL)
```

### 4. 列表嵌套

```html
<div data-slate-type="list">
  <div data-slate-type="list-line">第一项</div>
  <div data-slate-type="list-line">第二项</div>
</div>
```

转换后：
```markdown
- 第一项
- 第二项
```

## 📦 完整脚本（Node.js 版本）

```javascript
const fs = require('fs');
const cheerio = require('cheerio');

function htmlToMarkdown(htmlPath, outputPath) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const $ = cheerio.load(html);

  // --- 元数据 ---
  const title = $('meta[property="og:title"]').attr('content') 
    || $('title').text().replace(' - 极客时间', '');
  const description = $('meta[name="description"]').attr('content') || '';
  const author = $('.Index_columnName_7xLcq').first().text().trim() || '';

  // --- 处理函数 ---
  function getInlineText(el) {
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
          case 'link':
            const href = $node.attr('href') || '#';
            result += `[${$node.text()}](${href})`;
            break;
          default:
            result += $node.text();
        }
      }
    });
    return result.trim();
  }

  function processCodeBlock(el) {
    const lang = el.attr('data-code-language') || '';
    const lines = [];
    el.find('[data-slate-type="code-line"]').each((i, line) => {
      // 跳过空行
      const text = $(line).text().replace(/\s+$/, '');
      if (text || i === 0) lines.push(text);
    });
    return `\`\`\`${lang}\n${lines.join('\n')}\n\`\`\`\n\n`;
  }

  function processImage(el) {
    const img = el.find('img');
    const src = img.attr('src') || '';
    const alt = img.attr('alt') || '图片';
    const titleEl = el.find('[data-slate-type="image-title"]');
    const caption = titleEl.text().trim();
    let md = `![${caption || alt}](${src})\n\n`;
    if (caption) md += `*${caption}*\n\n`;
    return md;
  }

  function processList(el) {
    let md = '';
    el.find('[data-slate-type="list-line"]').each((i, item) => {
      const text = getInlineText($(item));
      if (text) md += `- ${text}\n`;
    });
    return md + '\n';
  }

  // --- 主逻辑 ---
  const $editor = $('[data-slate-editor="true"]');
  if (!$editor.length) {
    console.error('❌ 未找到文章内容区域');
    return;
  }

  let mdContent = '';

  $editor.children().each((i, child) => {
    const $child = $(child);
    const type = $child.attr('data-slate-type');
    
    if (!type) return;

    switch (type) {
      case 'heading': {
        const level = parseInt($child.prop('tagName').replace('h', ''));
        const text = getInlineText($child);
        if (text) mdContent += `${'#'.repeat(level)} ${text}\n\n`;
        break;
      }
      case 'paragraph': {
        const text = getInlineText($child);
        if (text) mdContent += `${text}\n\n`;
        break;
      }
      case 'pre': {
        mdContent += processCodeBlock($child);
        break;
      }
      case 'list': {
        mdContent += processList($child);
        break;
      }
      case 'image': {
        mdContent += processImage($child);
        break;
      }
      default: {
        // 其他类型直接提取文本
        const text = $child.text().trim();
        if (text) mdContent += `${text}\n\n`;
      }
    }
  });

  // --- 清理多余空行 ---
  mdContent = mdContent.replace(/\n{3,}/g, '\n\n');

  // --- 组装最终文档 ---
  const result = `# ${title}

**作者**：${author}

${description ? `> ${description}\n\n` : ''}

---

${mdContent}

---

*本文由脚本自动转换，生成于 ${new Date().toLocaleString()}*
`;

  fs.writeFileSync(outputPath, result, 'utf-8');
  console.log(`✅ 已生成：${outputPath}`);
}

// --- 使用 ---
htmlToMarkdown('page.html', 'output.md');
```

## 🚀 使用方法

```bash
# 安装依赖
npm install cheerio

# 运行脚本
node convert.js
```

## 📝 注意事项

| 问题 | 解决方案 |
|------|---------|
| **行号干扰** | 代码块中的行号在 `::before` 伪元素中，直接取 `text()` 即可忽略 |
| **高亮样式** | 高亮用 `mark-class` 标记，不影响文本提取 |
| **图片相对路径** | 可能需要补全为绝对路径（根据源页面 URL） |
| **特殊字符** | Markdown 中的 `|`, `*`, `_` 等需转义 |
| **音频/视频** | 此类非文本内容可忽略或做特殊标记 |

这个方案可以准确提取文章的核心内容，生成干净的 Markdown 文档，适合用于笔记、归档或二次编辑。