# L · 个人博客

基于 **Nuxt 4 + Nuxt Content 3 + Tailwind 4** 的个人博客，偏杂志 / 作品集风格的版式。
文章是本地 Markdown 文件，写完 `git push` 就发布；没有服务器，没有数据库。

> 目录结构、写文章、部署细节（GitHub Pages 六个坑、子路径、sitemap 修复）见 **[README-dev.md](./README-dev.md)**。
> 内容后台（纯静态 Sveltia CMS）见 **[SVELTIA-CMS.md](./SVELTIA-CMS.md)**。

---

## 技术栈

版本号取自 `package.json` / `bun.lock` 的实际解析结果。

### 应用框架

| 技术 | 版本 | 在本项目里的角色 |
| --- | --- | --- |
| [Nuxt](https://nuxt.com) | 4.5.2 | 应用框架：文件路由、组件/组合式自动导入、SSR / 预渲染、Nitro 服务端 |
| [Vue](https://vuejs.org) | 3.5.43 | UI 层，全部组件用 `<script setup>` 单文件组件 |
| Vue Router | 5.3.1 | 路由（由 Nuxt 接管，`app/pages/` 目录即路由表） |
| [Vite](https://vite.dev) | 8.3.0 | 开发服务器与构建器（`@nuxt/vite-builder`） |
| [Nitro](https://nitro.build) | 随 Nuxt | 服务端引擎：负责 `server/routes/*`、预渲染与静态产物 |
| TypeScript | 5.x | 配置、服务端路由、`app/data`、composables 均为 TS；`nuxt.config.ts` / `content.config.ts` |
| [Unhead](https://unhead.unjs.io) | 3.3.1 | `<head>` 元信息管理（title / canonical / OG） |

### 内容层（无数据库的后台）

| 技术 | 版本 | 说明 |
| --- | --- | --- |
| [Nuxt Content](https://content.nuxt.com) | 3.16.1 | 文件式 CMS：`content/posts/*.md` 构建期编译成路由 + 查询接口 |
| [MDC](@nuxtjs/mdc) | 0.23.1 | Markdown 语法扩展（可在 md 里直接写组件） |
| [Shiki](https://shiki.style) | 4.4.3 | 代码高亮，**构建期**完成，运行时零开销、不带 highlight.js |
| [Zod](https://zod.dev) | 3.25.76 | `content.config.ts` 里的内容模型校验（posts / projects 两个集合） |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | 11.10.0 | Content v3 的本地索引库，仅构建期使用 —— 因此 CI 必须固定 Node 版本 |
| remark / rehype / micromark | 随 Content | Markdown → HTML 的解析管线（GFM 表格、emoji、外链处理等） |

### 样式与设计系统

| 技术 | 版本 | 说明 |
| --- | --- | --- |
| [Tailwind CSS](https://tailwindcss.com) | 4.3.3 | 原子化 CSS，配置内联在 `main.css` 的 `@theme` 里（**没有** `tailwind.config.js`） |
| `@tailwindcss/vite` | 4.3.3 | Tailwind 4 的 Vite 插件（`nuxt.config.ts` 里 `vite.plugins` 注册） |
| 原生 CSS 变量 | — | 设计 token：纸感中性色 `--color-ink-*` + 强调色 `--color-accent-*`，换一个变量全站生效 |
| `@custom-variant` | — | 暗色模式走 `html.dark` class，而非系统的 `prefers-color-scheme` |
| [@nuxt/fonts](https://fonts.nuxt.com) | 0.14.0 | 字体加载，这里配成 `provider: 'local'`，读 `public/fonts/` 的 woff2 子集 —— 不依赖 Google Fonts，国内访问稳定 |
| Inter / Noto Sans SC / Noto Serif SC | `@fontsource/*` 5.3.x | 西文 + 中文黑体 + 中文衬线体三套字号体系 |
| [@nuxt/image](https://image.nuxt.com) | 2.1.0 | `<NuxtImg>` 组件，底层 IPX 图片处理（`ipx` 4.0.0-beta.1） |

### 交互与状态

| 技术 | 版本 | 说明 |
| --- | --- | --- |
| [VueUse](https://vueuse.org) | 15.0.0 | 组合式工具集（`@vueuse/nuxt`） |
| 自研 composables | — | `usePosts`（文章查询）、`useTheme`（暗色模式）、`useBasePath`（子路径拼接） |
| localStorage | 原生 | 主题与配色预设持久化；`nuxt.config.ts` 里有一段**内联首屏脚本**同步恢复主题，避免刷新白闪 |

### SEO

| 技术 | 版本 | 说明 |
| --- | --- | --- |
| [@nuxtjs/sitemap](https://nuxtseo.com/sitemap) | 8.5.1 | sitemap 生成 + 子路径 Bug 修复插件 |
| [@nuxtjs/robots](https://nuxtseo.com/robots) | 6.2.3 | robots.txt（仅在根路径部署时生成） |
| [nuxt-schema-org](https://nuxtseo.com/schema-org) | 6.3.2 | Schema.org 结构化数据 |
| [nuxt-seo-utils](https://nuxtseo.com) | 8.5.1 | canonical / OG 等通用元信息 |
| `@nuxtjs/seo` 全家桶 | 5.3.16 | **装了但只挑上面四个子模块单独引入** —— 它的 `nuxt-og-image` 会在构建期逐页渲染分享图，中文全字库会把构建从 3 分钟拖到 15 分钟以上，所以分享图改用静态图 `public/og-default.png` |
| RSS | Nitro 路由 | `server/routes/rss.xml.get.ts` 手写订阅源，不吃模块默认样式 |

### 服务端路由与产物形态

| 路由 | 文件 | 用途 |
| --- | --- | --- |
| `/search-index.json` | `server/routes/search-index.json.get.ts` | 构建期预渲染成静态 JSON，**纯静态托管也能全文搜索** |
| `/api/search` | `server/api/search.get.ts` | 索引取不到时的服务端回退 |
| `/rss.xml` | `server/routes/rss.xml.get.ts` | RSS 订阅源 |

产物两种形态：`nuxt generate` → `.output/public/`（纯静态，推荐）或 `nuxt build` → `.output/`（Node 服务）。

### 内容后台

| 技术 | 说明 |
| --- | --- |
| [Sveltia CMS](https://github.com/sveltia/sveltia-cms) | Git-based 后台，自托管在 `public/admin/`，**不引入任何构建步骤**。用 GitHub PAT 登录，改完直接提交回仓库，Actions 自动重建上线（补上了 Nuxt Studio 必须 SSR 的硬伤） |

### 脚本与工程化

| 技术 | 说明 |
| --- | --- |
| [Bun](https://bun.sh) | 包管理器与脚本运行器（`bun run dev` / `static` / `new`） |
| Node.js 22 | 构建与脚本运行时 —— 版本必须固定，`better-sqlite3` 原生绑定按 ABI 下载 |
| [sharp](https://sharp.pixelplumbing.com) 0.35.4 | `scripts/gen-og-image.mjs` 把 SVG 渲染成 1200×630 分享图，无需联网 |
| Chrome DevTools Protocol（原生 WebSocket） | `scripts/shot-page.mjs` 页面视觉体检：light/dark 双截图 + 几何探针 + WCAG 对比度与文字溢出计算，**不依赖 puppeteer** |
| `@takumi-rs/core` 2.14.0 | 已声明的 Rust 版 OG 图渲染器，目前分享图走 sharp，暂未启用 |

### 部署

| 技术 | 说明 |
| --- | --- |
| GitHub Actions | `.github/workflows/deploy-pages.yml`：装依赖 → 校验原生模块 → `bun run static` → 上传产物 |
| GitHub Pages | 子路径部署，`NUXT_APP_BASE_URL` 自动注入；`.nojekyll` 关掉 Jekyll（否则 `_nuxt/` 被吞、CSS/JS 全 404） |
| 兼容的其它托管 | Cloudflare Pages / Netlify / Vercel / 腾讯云 COS / 阿里云 OSS + CDN |

---

## 快速开始

```bash
bun install           # 或 npm / pnpm install
bun run dev           # 本地预览 http://localhost:3000
bun run new "标题"     # 新建一篇文章（自动生成 frontmatter）
bun run static        # 生成纯静态站点（产物在 .output/public）
```

> 本机 dev 只监听 IPv6，验证时用 `localhost:3000`，`127.0.0.1` 连不上。
> Windows + bun 下 `bun run build` 可能卡在最后不退出，改用 `bun run build:node`。

## 文档导航

| 文件 | 内容 |
| --- | --- |
| **README.md**（本文件） | 项目简介 + 技术栈 |
| [README-dev.md](./README-dev.md) | 目录结构、写文章、配色、部署、GitHub Pages 六个坑 |
| [SVELTIA-CMS.md](./SVELTIA-CMS.md) | 内容后台怎么用、为什么这么实现 |
| `token.md` | 本地凭据（**不要提交**） |
