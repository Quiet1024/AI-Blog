# 拾光集 · 个人博客

基于 **Nuxt 4 + Nuxt Content 3 + Tailwind 4** 的个人博客，偏杂志 / 作品集风格的版式。
文章是本地 Markdown 文件，写完 `git push` 就发布；没有后台，没有数据库。

## 快速开始

```bash
bun install           # 或 npm / pnpm install
bun run dev           # 本地预览 http://localhost:3000
bun run new "标题"     # 新建一篇文章（自动生成 frontmatter）
bun run build:node    # 构建 Node 服务端产物（.output）
bun run static        # 生成纯静态站点（产物在 .output/public）
```

> 本项目用 bun 安装依赖。磁盘紧张时可把缓存指到别的盘：
> `BUN_INSTALL_CACHE_DIR=E:/xxx bun install`
>
> **如果 `bun run build` 卡在最后一步不退出**（Windows + bun 包装层的已知现象，控制台已经
> 打印 "Build complete" 但命令不返回），改用 `bun run build:node` 即可正常结束。

## 目录结构

```
content/
  posts/*.md        文章（Markdown，frontmatter 见下）
  projects/*.yml    作品集条目（纯数据，首页和作品页展示）
app/
  data/site.ts      全站信息：站名、简介、导航、社交链接  ← 先改这里
  assets/css/main.css  设计 token + 文章排版样式
  components/       组件（site/ 站点框架，content/ 内容展示）
  composables/      usePosts（文章查询）、useTheme（暗色模式）、useBasePath（子路径拼接）
  layouts/default.vue  页头 + 页脚 + 阅读进度条
  pages/            index 首页 / blog 列表+详情 / tags / projects / about
server/
  routes/search-index.json.get.ts  静态搜索索引（构建时预渲染成 JSON）
  routes/rss.xml.get.ts  RSS 订阅源
  api/search.get.ts    服务端搜索接口（索引取不到时的回退）
  plugins/sitemap-subpath-fix.ts  子路径部署时修正 sitemap 里的错误地址
  utils/sitemap-subpath.mjs       上面那条修复的纯函数实现（可单独验证）
content.config.ts      内容模型（改字段就改这里）
public/                静态资源
scripts/
  new-post.mjs         新建文章脚手架（bun run new）
  gen-og-image.mjs     生成分享图
  preview-theme.mjs    查看参考主题的配置
  verify-sitemap-subpath.mjs  子路径部署下 sitemap 的回归验证（可脱离构建跑）
```

## 写一篇文章

一条命令起手，frontmatter 自动填好：

```bash
bun run new "为什么我又把博客重写了一遍" --slug rewrite-my-blog --tags 随笔,写作
```

常用选项：

| 选项 | 作用 |
| --- | --- |
| `--slug <名字>` | 网址用的英文名（不写则从标题里的英文字符推导） |
| `--tags a,b` | 标签，逗号分隔（中文逗号也行） |
| `--draft` | 标记为草稿，不进列表 / RSS / 搜索 |
| `--featured` | 放到首页头条位 |
| `--no-serif` | 正文用无衬线体（默认衬线） |

生成后直接开写（另开一个终端，保存即刷新）：

```bash
bun run dev
```

**文件名就是网址**（`content/posts/my-post.md` → `/blog/my-post`），所以 slug 起得像样点。
纯中文标题会先用 `post-20260922` 占位，把文件改个名就换成好看的网址了。

frontmatter 长这样：

```markdown
---
title: "文章标题"
description: "一句话摘要，用于列表页和 SEO"
date: 2026-09-22
tags: ["设计", "前端"]
featured: false     # true = 上首页头条位（取最新一篇）
cover: /cover.jpg   # 可不填，不填会自动生成渐变封面
draft: false        # true = 不发布、不进 RSS / 搜索
serif: true         # true = 正文用衬线体
author: "你的名字"   # 可不填
---

正文用 Markdown 写。二三级标题会自动生成右侧目录。
```

> 想加新字段（比如 `coverAlt`），`content.config.ts` 的 zod schema 也要同步加，否则校验不过。

## 已经装好的能力

| 能力 | 说明 |
| --- | --- |
| 暗色模式 | 跟随系统，手动切换后记在 localStorage，首屏无白闪 |
| 配色预设 | 页头右上角色点切换：青绿 / 琥珀 / 苔绿 / 深海蓝 / 陶土 / 石墨，同样记在 localStorage |
| 标签 / 分类 | 自动生成标签页，列表页可按标签筛选 |
| 全文搜索 | `Cmd/Ctrl + K` 或 `/` 唤起，命中标题/摘要/标签/正文。走预渲染的静态索引 `/search-index.json`，**纯静态托管也能搜**，不依赖服务端 |
| RSS | `/rss.xml` |
| SEO | sitemap、robots、Schema.org，都读 `site.url` |
| 分享图 | 静态图 `public/og-default.png`，由 `scripts/gen-og-image.mjs` 生成；文章配了 `cover` 则优先用封面 |
| 封面兜底 | 没配图的文章按标题 hash 生成渐变封面，首页不会空 |
| 阅读进度 | 文章页顶部进度条 |
| 代码高亮 | Shiki，构建期完成，不带运行时开销 |

先改哪个文件？只有三种情况：

| 想改什么 | 改哪里 |
| --- | --- |
| 站名 / 简介 / 域名 / 作者 / 社交链接 | `app/data/site.ts` |
| 配色（强调色）、字体、正文排版 | `app/assets/css/main.css` |
| 文章字段（加一个 `coverAlt` 之类） | `content.config.ts` 的 zod schema |

### 换配色

配色是 CSS 变量，改一处全站生效（链接、标签、边框、进度条、按钮）。

- **临时看效果**：页头右上角的色点，点开切 6 套预设，选完记在浏览器里。
- **设为默认**：改 `app/assets/css/main.css` 里 `:root` 的 `--color-accent-*`。
- **加一套新的**：在 `main.css` 抄一段 `[data-accent='xxx'] { … }` 改颜色，
  再到 `app/data/accents.ts` 里登记（`name` 要和 CSS 里的属性值一致），
  切换器会自动多出一个选项。

调整主色只需要改 `--color-accent-300/500/600` 这三个最常用的层级，其余可保持。

### 看别人的主题怎么写的

```bash
node scripts/preview-theme.mjs                # 列出参考主题的配置入口和关键行
node scripts/preview-theme.mjs blog-v3        # 装依赖并在 3100 端口跑起这一套
node scripts/preview-theme.mjs blog-v3 3200 --skip-install
```

不想装依赖也够用：直接读它列出来的 `app/app.config.ts` / `tailwind.config.js` 就行——
Nuxt UI 系的主题都靠 `ui.colors.primary` 换主色，Tailwind 系的靠 `theme.extend.colors`。

## 日常流程（写 → 看 → 发布 → 更新）

### 1. 写

```bash
bun run new "标题" --tags 随笔     # 生成 content/posts/xxx.md
bun run dev                        # 另开一个终端
```

写完就结束了——路由、标签页、RSS、搜索索引、sitemap 全部自动生成，不用在任何地方手动登记。

### 2. 看

`bun run dev` 起本地服务（默认 3000 端口）。改 Markdown、改组件、改样式都是保存即刷新。

> 本机 dev 只监听 IPv6，验证时用 `localhost:3000`，用 `127.0.0.1` 连不上。

### 3. 发布（首次上线）

见下面「部署」一节。

### 4. 更新已发布的文章

直接改 `content/posts/xxx.md`，流程和发布一样：

```bash
bun run dev        # 本地：改完立刻看效果

bun run static     # 上线：重新打包，产物在 .output/public
# 把 .output/public 里更新过的文件覆盖上传即可
```

三个坑：

- **只改正文，别动 `date`**：那是发布时间。要标注修订就加一行 `updated: 2026-09-22`。
- **别改文件名**：文件名就是网址，改了等于换链接，旧链接会 404（非改不可就配重定向）。
- **Markdown 不会自己生效**：静态站点是构建产物，必须重新 `bun run static` 再上传。用 Git 自动部署的话，`git push` 就够了。

## 部署

两种产物形态，按托管方式二选一：

| 方式 | 命令 | 产物 | 适合 |
| --- | --- | --- | --- |
| **纯静态** | `bun run static` | `.output/public/`（HTML/CSS/JS/JSON） | 对象存储 / CDN / Pages —— 推荐，最省钱省心 |
| Node 服务 | `bun run build:node` | `.output/`（含 server） | 自己的服务器 / 支持 Node 的 PaaS |

搜索已经改成静态索引，所以**纯静态托管功能不缺**：搜索、标签、RSS、sitemap 全都能用。

### 纯静态（推荐）

```bash
bun run static          # 产物目录：.output/public
```

把 `.output/public/` 里的全部文件上传到任意静态托管：

- **国内**：腾讯云 COS / 阿里云 OSS（开静态网站托管）+ CDN；或 EdgeOne Pages
- **国外**：Cloudflare Pages / Netlify / Vercel / GitHub Pages

上传方式随意：控制台拖拽、`coscmd` / `ossutil`、或 `rclone sync`。之后再更新就是覆盖同名文件。

### 自己的服务器（Node 服务）

```bash
bun run build:node
# 把整个 .output 上传到服务器，然后：
node .output/server/index.mjs     # 默认 3000 端口，可用 PORT=8080 覆盖

pm2 start .output/server/index.mjs --name blog    # 常驻
pm2 save
```

前面挂 nginx 反代到 3000 端口即可。

### Git 自动部署（push 即上线）

把仓库连到 Cloudflare Pages / Netlify / Vercel：

- 构建命令：`bun run static`
- 输出目录：`.output/public`

之后 `git push` 自动重新构建并上线，是长期最省事的方式。

### GitHub Pages

**可以，而且已经配好了** —— 仓库里带了 `.github/workflows/deploy-pages.yml`，推上去就能用。

#### 一次性设置

```bash
# 1. 新建 GitHub 仓库后，关联并推送（默认分支保持 master）
git remote add origin https://github.com/<用户名>/<仓库名>.git
git push -u origin master
```

2. 打开仓库 **Settings → Pages → Build and deployment**，把 **Source** 选成 **GitHub Actions**
   （⚠️ 不要选 "Deploy from a branch"，工作流方式才能拿到 baseURL 注入）。

   > 这一步**必须手工做一次**：Actions 自带的 token 没有创建 Pages 站点的权限，
   > 不先开启就发布，`configure-pages` 会报
   > `Create Pages site failed. Resource not accessible by integration`。
   > 开过之后，之后每次推送都会自动发布，不需要再管。
   >
   > 也可以用有 `repo` 权限的 token 直接调 API 开通：
   > `POST /repos/<用户名>/<仓库名>/pages`，body `{"build_type":"workflow"}`。
3. 进 **Actions** 标签，等 `Deploy to GitHub Pages` 跑完，站点地址是
   `https://<用户名>.github.io/<仓库名>/`。

之后每次 `git push` 都会自动重新构建并发布。

#### 已自动处理六个必踩的坑

| 坑 | 处理方式 |
| --- | --- |
| **子路径** | 项目页跑在 `/<仓库名>/` 之下，所有资源都必须带这个前缀。工作流自动判断并注入 `NUXT_APP_BASE_URL`：仓库名形如 `<user>.github.io` 时用 `/`，否则用 `/<仓库名>/`。同时注入 `NUXT_PUBLIC_SITE_URL`（**只放源地址，不带路径**） |
| **Jekyll 吞掉 `_nuxt/`** | GitHub Pages 默认用 Jekyll 处理站点，而 **Jekyll 会忽略下划线开头的目录** —— `_nuxt/`、`__nuxt_content/` 被无视，结果是 CSS/JS 全 404、页面变裸 HTML。`public/.nojekyll`（随构建产物输出）+ 工作流里的 `touch .output/public/.nojekyll` 双重保证关掉它 |
| **sitemap 里首页变成 `/<repo>/<repo>`** | `@nuxtjs/sitemap` v8.5.1 在子路径下的拼接 Bug：首页被预渲染成带尾斜杠的 `/<repo>/`，而模块会先削掉尾斜杠再判断「是否已带前缀」，判断因此失败、又拼了一次 base，产出不存在的 `/<repo>/<repo>`。`server/plugins/sitemap-subpath-fix.ts` 在 `sitemap:resolved` 钩子里把它纠正回来（顺带补上 `<image:loc>` 漏掉的子路径）。根路径部署时该插件是空操作 |
| **原生模块缺失导致构建起不来** | CI 上构建曾在 1 秒内以 exit 1 结束，日志是 `Could not locate the bindings file`：**bun 默认不执行依赖的安装脚本**，`@nuxt/content` 用的 `better-sqlite3` 原生绑定因此没被下载，而构建是用 `node` 跑的，于是打开 SQLite 时直接挂掉。解法是 `package.json` 里的 `trustedDependencies: ["better-sqlite3"]`（允许 bun 执行它的安装脚本）+ 工作流固定 Node 22 + 一个「校验原生模块」步骤让这类问题当场暴露 |
| **`NUXT_PUBLIC_SITE_URL` 会把 `runtimeConfig.public.siteUrl` 覆盖掉** | Nuxt 会把 `NUXT_PUBLIC_SITE_URL` 映射到 `runtimeConfig.public.siteUrl`，而这个变量名又被 `nuxt-site-config` 占着、只能是**不带路径的源地址**。两者同名 → 运行时读到的 `siteUrl` 变成源地址，RSS 链接、OG 图、sitemap 修复全都丢掉 `/<repo>`。所以运行时配置里改叫 `siteOrigin` / `siteFullUrl`，不再与 Nuxt 约定重名 |
| **canonical 被小写化** | 仓库名（→ 子路径）含大写字母时（如 `/AI-Blog/`），`nuxt-seo-utils` 默认把 canonical 整体小写化成 `/ai-blog`，而 **GitHub Pages 的路径区分大小写**，等于 canonical 指向 404。已设 `seo: { canonicalLowercase: false }` |

> 这个 sitemap 修复可以脱离构建单独回归：`node scripts/verify-sitemap-subpath.mjs`
> —— 它把 `@nuxtjs/sitemap` 自己的运行时代码按真实顺序跑一遍，并先自检「关闭修复时能否复现出 Bug」，
> 同时断言「不含重复段的正常 URL 必须逐字不变」。

#### 本地先看子路径效果

```bash
# 子路径交给 NUXT_APP_BASE_URL；NUXT_PUBLIC_SITE_URL 只放「源」地址（协议+域名，不带路径）
NUXT_APP_BASE_URL=/my-blog/ NUXT_PUBLIC_SITE_URL=https://<用户名>.github.io \
  bun run static
npx serve .output/public        # 起个静态服务器看效果
```

> `NUXT_PUBLIC_SITE_URL` 里**不要**带 `/my-blog` —— nuxt-site-config 自己就认这个变量，
> 带了路径构建期会警告；子路径由 `app.baseURL` 负责，RSS / OG 图读 `siteFullUrl`、sitemap 读 `app.baseURL`。

#### 想换成自有域名

在 GitHub Pages 设置里填 Custom domain，然后**去掉 baseURL**（用默认 `/`），
把 `app/data/site.ts` 的 `url` 改成自己的域名即可 —— 根路径部署不需要 baseURL。

> ⚠️ 项目页的两个 SEO 小限制：`robots.txt` 会落在 `/<repo>/robots.txt`，
> 而爬虫只读域名根的 `/robots.txt`；sitemap 同理需要手动提交。
> 认真做 SEO 的话建议配自有域名（或直接用 `<user>.github.io` 用户主页仓库，天生在根路径）。

## 上线前要改的地方

1. `app/data/site.ts`：站名、简介、**域名**、作者、社交链接。
2. `public/avatar.svg`：换成自己的头像。
3. 改完站名/域名后，跑一次 `node scripts/gen-og-image.mjs` 重新生成分享图。

> 域名也可以用环境变量覆盖，不必改源码：构建时设 `NUXT_PUBLIC_SITE_URL=https://your.domain`
> 与 `NUXT_APP_BASE_URL=/子路径/`（根路径部署留空即可）。GitHub Pages 工作流就是这么注入的。

### 关于动态 OG 图

`@nuxtjs/seo` 全家桶里自带的 `nuxt-og-image` 会在构建期逐页渲染分享图。
中文字体全字集体量很大，本地构建会把构建时间从 3 分钟拖到 15 分钟以上（甚至挂死），
因此这里改成 **sitemap + robots + schema-org 三个模块单独引入 + 静态分享图**。
需要每篇文章一张动态图的话，重新安装 `@nuxtjs/seo` 并配好本地字体子集即可。

## 参考主题放在哪

**在项目外面**：`E:/my-work-boke/reference-themes/`（`scripts/preview-theme.mjs` 默认读这里，
可用环境变量 `THEMES_DIR` 指向别处）。

为什么不放项目里：Tailwind 4 会自动扫描项目内的源文件来收集类名，几套完整主题躺在项目里，
构建会从几分钟变成二十分钟以上。所以参考主题一律放在项目外，也不进 git。

| 目录 | 仓库 | 特点 |
| --- | --- | --- |
| `bloggrify` | bloggrify/bloggrify | 功能最全的 Content starter |
| `nuxt-blog` | nurRiyad/nuxt-blog | 卡片流 + 搜索 + 分页 |
| `blog-v3` | l33z22l11/blog-v3 | Clarity，中文阅读体验好 |
| `2giosangmitom` | 2giosangmitom/2giosangmitom.github.io | 极简 Nuxt UI |
| `nuxt-theme-next` | ZvonimirSun/nuxt-theme-next | Nuxt UI v4 layer |

补拉主题（都在项目外）：

```bash
mkdir -p ../reference-themes && cd ../reference-themes
git clone --depth 1 https://github.com/bloggrify/bloggrify.git
```
