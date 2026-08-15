const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

function htmlToMarkdown(htmlPath, outputPath) {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const $ = cheerio.load(html);

    // --- 元数据 ---
    const title = $('meta[property="og:title"]').attr('content')
        || $('title').text().replace(' - 极客时间', '')
        || $('audio').attr('title')  // 内容片段无 title/meta，标题在 audio 标签上
        || path.basename(htmlPath, path.extname(htmlPath))  // 直播回放等无 audio 的兜底
        || '';
    const description = $('meta[name="description"]').attr('content') || '';
    // const author = $('.Index_columnName_7xLcq').first().text().trim() || '';
    const author = $('[class*="Index_articleInfo_"]').first().text().trim() || '';  

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
                // tagName 为 H2/H3（大写），需忽略大小写
                const level = parseInt($child.prop('tagName').replace(/^h/i, ''), 10) || 1;
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

// --- 批量转换 ---
function batchConvert() {
    const htmlDir = path.join(__dirname, 'dist', 'html');
    const mdDir = path.join(__dirname, 'dist', 'md');

    if (!fs.existsSync(htmlDir)) {
        console.error(`❌ 目录不存在：${htmlDir}`);
        process.exit(1);
    }
    // 确保输出目录存在
    fs.mkdirSync(mdDir, { recursive: true });

    const files = fs.readdirSync(htmlDir)
        .filter(f => f.toLowerCase().endsWith('.html'))
        .sort();

    if (!files.length) {
        console.log('⚠️ 未找到任何 .html 文件');
        return;
    }

    console.log(`📂 发现 ${files.length} 个 HTML 文件，开始转换...\n`);
    let success = 0, failed = 0;

    for (const file of files) {
        const inputPath = path.join(htmlDir, file);
        const outputName = file.replace(/\.html$/i, '.md');
        const outputPath = path.join(mdDir, outputName);
        try {
            htmlToMarkdown(inputPath, outputPath);
            success++;
        } catch (e) {
            failed++;
            console.error(`❌ 转换失败：${file} → ${e.message}`);
        }
    }

    console.log(`\n📊 转换完成：成功 ${success} 个，失败 ${failed} 个`);
    console.log(`📁 输出目录：${mdDir}`);
}

// --- 使用 ---
// htmlToMarkdown('page.html', 'output.md');
// batchConvert(); // 遍历 ./dist/html 下所有文件，导出 md 到 ./dist/md

batchConvert();

