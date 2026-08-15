// geektime-fetcher.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const { fetchArticle } = require('./extract-article-api.cjs');
const { extractArticle } = require('./extract-article-browser.cjs')
// ============ 配置加载 ============
function loadConfig() {
  const configPath = path.join(__dirname, '.env');
  if (!fs.existsSync(configPath)) {
    console.error('❌ 配置文件 .env 不存在！');
    console.log('请创建 .env 并填入:');
    console.log('phone=你的手机号');
    console.log('password=你的密码');
    process.exit(1);
  }
  const config = {};
  const configContent = fs.readFileSync(configPath, 'utf-8');
  configContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      config[key.trim()] = value.trim();
    }
  });
  if (!config.phone || !config.password) {
    console.error('❌ 配置文件缺少 phone 或 password 字段');
    process.exit(1);
  }
  return config;
}

// ============ HTTP 请求工具 ============
function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: JSON.parse(body)
          });
        } catch {
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// ============ 登录 ============
async function login(phone, password) {
  console.log(`📱 正在登录: ${phone}...`);

  const options = {
    hostname: 'account.geekbang.org',
    path: '/account/ticket/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Origin': 'https://account.geekbang.org',
      'Referer': 'https://account.geekbang.org/'
    }
  };

  const result = await request(options, {
    cellphone: phone,
    password: password,
    captcha: '',
    remember: 1,
    appid: 1,
    country: 86,
    platform: 3
  });

  if (result.statusCode !== 200) {
    throw new Error(`登录失败: HTTP ${result.statusCode}`);
  }

  // 从响应头提取 Cookie
  const setCookie = result.headers['set-cookie'] || [];
  const cookies = {};
  setCookie.forEach(cookie => {
    const parts = cookie.split(';')[0].split('=');
    if (parts.length === 2) {
      cookies[parts[0].trim()] = parts[1].trim();
    }
  });

  // 检查关键 Cookie（服务端返回的是大写 GCID/GCESS，需大小写不敏感匹配）
  const hasCookie = (name) =>
    Object.keys(cookies).some(k => k.toLowerCase() === name.toLowerCase());
  if (!hasCookie('gcid') || !hasCookie('gcess')) {
    console.warn('⚠️ 未获取到完整 Cookie，可能登录失败');
    console.log('响应:', JSON.stringify(result.body, null, 2));
  }

  console.log('✅ 登录成功！');
  return cookies;
}

// ============ 获取已购课程列表 ============
async function getCourses(cookies) {
  console.log('📚 正在获取已购课程列表...');

  const cookieStr = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  const options = {
    hostname: 'time.geekbang.org',
    path: '/serv/v3/learn/product',
    method: 'POST',
    headers: {
      'Cookie': cookieStr,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': 'https://time.geekbang.org/'
    }
  };
  const body = { "desc": true, "expire": 1, "last_learn": 0, "learn_status": 0, "prev": 0, "size": 20, "sort": 1, "type": "", "with_learn_count": 1 }
  const result = await request(options, body);
  if (result.statusCode !== 200) {
    throw new Error(`获取课程列表失败: HTTP ${result.statusCode}`);
  }

  const data = result.body;
  if (data.code !== 0) {
    throw new Error(`API 返回错误: ${data.msg || '未知错误'}`);
  }

  const products = data.data?.products || [];
  console.log(`✅ 找到 ${products.length} 门课程`);
  return products;
}

// ============ 获取专栏文章列表 ============
async function getColumnArticles(columnId, cookies) {
  const cookieStr = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  const body = { "cid": columnId, "size": 500, "prev": 0, "order": "earliest", "sample": false };
  const options = {
    hostname: 'time.geekbang.org',
    path: `/serv/v1/column/articles`,
    method: 'POST',
    headers: {
      'Cookie': cookieStr,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Content-Type': 'application/json',
      // 缺少 Origin/Referer 会被 WAF 判定为爬虫并返回 HTTP 451
      'Origin': 'https://time.geekbang.org',
      'Referer': 'https://time.geekbang.org/'
    }
  };

  const result = await request(options, body);
  if (result.statusCode !== 200) {
    throw new Error(`获取文章列表失败: HTTP ${result.statusCode}`);
  }

  const data = result.body;
  if (data.code !== 0) {
    throw new Error(`API 返回错误: ${data.msg || '未知错误'}`);
  }

  return data.data?.list || [];
}

// ============ 获取文章详情 ============
async function getArticleDetail(articleId, cookies) {
  const cookieStr = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  const body = {"id":articleId,"include_neighbors":true,"is_freelyread":true};
  const options = {
    hostname: 'time.geekbang.org',
    path: `/serv/v1/article`,
    method: 'POST',
    headers: {
      'Cookie': cookieStr,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Content-Type': 'application/json',
      // 缺少 Origin/Referer 会被 WAF 判定为爬虫并返回 HTTP 451
      'Origin': 'https://time.geekbang.org',
      'Referer': 'https://time.geekbang.org/'
    }
  };

  const result = await request(options, body);
  if (result.statusCode !== 200) {
    throw new Error(`获取文章详情失败: HTTP ${result.statusCode}`);
  }
  const data = result.body;
  if (data.code !== 0) {
    throw new Error(`API 返回错误: ${data.msg || '未知错误'}`);
  }
  return data.data || {};
}

// ============ 保存 Cookie（供后续复用） ============
function saveCookies(cookies) {
  const cookiePath = path.join(__dirname, 'cookies.json');
  fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2), 'utf-8');
  console.log(`💾 Cookie 已保存到 ${cookiePath}`);
}

function loadCookies() {
  const cookiePath = path.join(__dirname, 'cookies.json');
  if (!fs.existsSync(cookiePath)) return null;
  return JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
}

// ============ 主函数 ============
async function main() {
  console.log('🚀 极客时间课程获取脚本启动\n');

  // 1. 加载配置
  const config = loadConfig();

  // 2. 尝试加载已有 Cookie，否则登录
  let cookies = loadCookies();
  const hasCookie = (name) =>
    cookies && Object.keys(cookies).some(k => k.toLowerCase() === name.toLowerCase());
  if (!cookies || !hasCookie('gcid') || !hasCookie('gcess')) {
    cookies = await login(config.phone, config.password);
    saveCookies(cookies);
  } else {
    console.log('📂 使用已保存的 Cookie');
  }

  // 3. 获取课程列表
  const courses = await getCourses(cookies);

  if (courses.length === 0) {
    console.log('⚠️ 没有找到已购课程');
    return;
  }

  // 4. 显示课程列表
  console.log('\n📖 已购课程列表:');
  courses.forEach((course, index) => {
    const title = course.title || course.name || '未命名课程';
    const id = course.id || course.cid || 'N/A';
    console.log(`  ${index + 1}. ${title} (ID: ${id})`);
  });

  // 5. 示例：获取第一门课程的文章列表
  const firstCourse = courses[0];
  const columnId = firstCourse.id || firstCourse.cid;
  if (columnId) {
    console.log(`\n📄 正在获取「${firstCourse.title || firstCourse.name}」的文章列表...`);
    const articles = await getColumnArticles(columnId, cookies);
    console.log(`✅ 共 ${articles.length} 篇文章`);
    articles.slice(0, 5).forEach((article, i) => {
      console.log(`  ${i + 1}. ${article.article_title || article.title}`);
    });
    if (articles.length > 5) {
      console.log(`  ... 还有 ${articles.length - 5} 篇`);
    }
    let useBrowserExtraction = true; // 默认使用 API 提取文章详情
    if (useBrowserExtraction) {
      console.log('\n⚠️ 使用浏览器方式提取文章详情，速度较慢（每篇约 4~12s）');
      for(let article of articles) { // 仅示例获取前 2 篇文章详情
        const { id, article_title } = article;
        console.log(`\n📄 正在获取文章详情: ${article_title}...`);
        const articleDetail = await extractArticle(id);
        const { content: article_content } = articleDetail;
        console.log(`✅ ${article_title} 文章详情文字长度:`, article_content.length );
        fs.writeFileSync(path.join(__dirname, `/dist/html/${article_title}.html`), article_content, 'utf-8');
      }
    } else {
      console.log('\n⚠️ 使用 API 方式提取文章详情，速度较快，但可能缺少部分渲染内容');
      for(let article of articles.slice(0, 2)) { // 仅示例获取前 2 篇文章详情
        const { id, article_title } = article;
        console.log(`\n📄 正在获取文章详情: ${article_title}...`);
        // const articleDetail = await getArticleDetail(id, cookies);
        const articleDetail = await fetchArticle(id);
        const { content: article_content } = articleDetail;
        console.log(`✅ ${article_title} 文章详情文字长度:`, article_content.length );
        fs.writeFileSync(path.join(__dirname, `/dist/html/${article_title}.html`), article_content, 'utf-8');
      }
    }
  }

  console.log('\n✅ 执行完成！');
}

// ============ 运行 ============
main().catch(err => {
  console.error('❌ 发生错误:', err.message);
  process.exit(1);
});