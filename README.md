# geektime-tools

极客时间（time.geekbang.org）内容抓取命令行工具。

## 安装

### 从 npm 安装（推荐）

```bash
npm install -g geektime-tools
# 或使用 pnpm / yarn
pnpm add -g geektime-tools
```

安装后可直接使用 `geektime` 命令。首次使用先配置账号（任意路径均可）：

```bash
# 方式一：通过 --config 指定凭证文件（推荐，凭证不写入全局）
geektime --config ~/.geektime.env login

# 方式二：不传 --config 时，默认读取当前目录下的 .env
```

`.env` 内容：

```
phone=你的手机号
password=你的密码
```

> browser 模式需要本机已安装 Google Chrome（复用系统 Chrome，无需 `playwright install` 下载浏览器）。

### 本地开发

```bash
pnpm install
# 可选：全局链接，之后可直接使用 `geektime` 命令
pnpm link --global
```

前置：项目根目录 `.env` 中配置账号：

```
phone=你的手机号
password=你的密码
```

## 命令一览

```bash
geektime login                      # 登录并保存会话 Cookie（cookies.json）
geektime courses                    # 列出已购课程
geektime articles <columnId>        # 列出专栏文章
geektime fetch <articleId>          # 抓取单篇文章
geektime sync <columnId>            # 同步整个专栏
geektime convert                    # 批量 dist/html → dist/md
```

## 常用示例

```bash
# 首次使用先登录
node bin/geektime.cjs login

# 查看已购课程，拿到专栏 ID
node bin/geektime.cjs courses

# 查看某专栏的文章列表
node bin/geektime.cjs articles 1005603

# 抓单篇（API 模式，快）
node bin/geektime.cjs fetch 1005603

# 抓单篇并直接转 Markdown
node bin/geektime.cjs fetch 1005603 --format md

# 同步整个专栏为 Markdown（并发 4，断点续传）
node bin/geektime.cjs sync 1005603 --format md --concurrency 4 --resume

# 浏览器模式（慢但完整，含懒加载图片/代码高亮）
node bin/geektime.cjs sync 1005603 --mode browser --limit 3

# 已下载的 HTML 批量转 Markdown
node bin/geektime.cjs convert

# 脚本化：JSON 输出
node bin/geektime.cjs courses --json
node bin/geektime.cjs sync 1005603 --format md --json | jq '.results[] | select(.status=="failed")'
```

## 全局选项

| 选项 | 说明 |
| --- | --- |
| `--config <path>` | `.env` 路径（默认当前目录 `.env`） |
| `--cookies <path>` | `cookies.json` 路径（默认当前目录） |
| `--json` | 结果以 JSON 输出到 stdout，日志改到 stderr |
| `--quiet` / `--verbose` | 日志控制 |

## fetch / sync 选项

| 选项 | 说明 |
| --- | --- |
| `--mode api\|browser` | 提取方式，默认 `api` |
| `--format html\|md\|text` | 输出格式，默认 `html`；文件落到 `<out>/html\|md\|text/` |
| `--out <dir>` | 输出基目录，默认当前目录 `dist` |
| `--limit <n>` | 最多抓取篇数 |
| `--concurrency <n>` | 并发数，默认 3（browser 模式建议 1~2） |
| `--resume` | 跳过已存在文件（断点续传） |
| `--retries <n>` | 每篇失败重试次数，默认 2（指数退避） |
| `--profile-dir <dir>` | browser 模式的持久化 profile（默认 `.browser-profile/`） |
| `--no-headless` | browser 模式显示浏览器窗口 |

## 说明

- 会话 Cookie 与 Node TLS 指纹绑定：**API 列表/正文** 用 `cookies.json`（Node 登录产生）；
  **browser 正文** 由浏览器内重新登录产生（存于 `.browser-profile/`），两者不可混用。
- 极客时间对连续登录有风控，`login` 不要频繁调用；`--force` 仅在 Cookie 失效时使用。
- 退出码：0 成功；1 运行出错或同步/转换存在失败项。
- 仅限个人已购内容备份使用

## 发布到 npm（维护者）

仓库已配置 GitHub Actions 自动发布（`.github/workflows/npm-publish.yml`），打标签即发布：

```bash
# 1. 先提交代码改动（含 workflow），再提升版本：
#    ⚠️ push: tags 触发的运行使用的是 tag 指向的那个 commit 里的 workflow，
#    若先打 tag 后改 workflow，线上跑的仍是旧版本
git add -A && git commit -m "..."
npm version patch     # 或 minor / major（生成 commit + v* tag）

# 2. 推送并触发 Actions 发布（标签 v* 自动发布 + 生成 GitHub Release）
git push && git push origin --tags
```

前置要求（一次性）：

1. 在 [npmjs.com](https://www.npmjs.com) 为 `geektime-tools` 配置 **Trusted Publishing**（包页面 → Settings → Trusted Publishing，选择本仓库与 `.github/workflows/npm-publish.yml`）；
2. 发布**无需**任何 npm Token / GitHub 密钥——workflow 通过 OIDC（`id-token: write` 权限）自动完成认证与 provenance 签名；
3. 首次发布前本地执行一次 `npm publish --dry-run` 确认包内容（`files` 白名单已排除凭证与下载内容）。

也可在 Actions 页面手动 Run workflow 重新触发发布。
