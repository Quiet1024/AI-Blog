import tailwindcss from '@tailwindcss/vite'
import { siteConfig } from './app/data/site'

/**
 * 部署基路径。
 * - 自有域名 / 用户主页（<user>.github.io）→ '/'
 * - GitHub Pages 项目页（<user>.github.io/<repo>/）→ '/<repo>/'
 * 由环境变量 NUXT_APP_BASE_URL 注入（见 .github/workflows/deploy-pages.yml）。
 */
const baseURL = process.env.NUXT_APP_BASE_URL || '/'
const basePrefix = baseURL.replace(/\/+$/, '')

/**
 * 站点地址有两个来源，语义**不同**，必须分开处理：
 *
 *   - CI：环境变量 NUXT_PUBLIC_SITE_URL 只给「源」（协议+域名），子路径由
 *     NUXT_APP_BASE_URL（→ baseURL / basePrefix）提供。
 *   - 本地：回退到 siteConfig.url，而它是**完整地址**，自带 '/AI-Blog' 这段路径。
 *
 * 变量名不要改 —— nuxt-site-config 自己就认 NUXT_PUBLIC_SITE_URL，
 * 并且明确要求它不含路径（含了会报 "should not contain a path" 警告）。
 * 曾经的回退值是直接拿 siteConfig.url 当「源」，于是本地 site.url 带了路径：
 * 既触发上面那条警告，也让 server/plugins/sitemap-subpath-fix.ts 拿到一个
 * 错误的「源」（它预期的是 https://<user>.github.io 这种形态）。
 * 所以这里统一用 URL 解析把「源」与「路径」拆开。
 */
const configuredSiteUrl = (process.env.NUXT_PUBLIC_SITE_URL || siteConfig.url).replace(/\/+$/, '')

/**
 * 用正则把「源」与「路径」切开，**刻意不用 `new URL(...).origin`**：
 * URL 规范会把主机名强制转小写，而 CI 的 NUXT_PUBLIC_SITE_URL 来自
 * `github.repository_owner`，实际是 'https://Quiet1024.github.io'（Q 大写）。
 * sitemap 里的 <loc> 会原样保留这个大小写，而 server/utils/sitemap-subpath.mjs
 * 需要拿 siteOrigin 去和 loc 做前缀比对 —— 这里一旦转成小写就比对不中，
 * 首页那条 /<repo>/<repo> 会静默漏修（已真实踩到：线上 sitemap 出现
 * https://Quiet1024.github.io/AI-Blog/AI-Blog）。
 * 正则只做切分、不改写任何字符，因此大小写原样保留。
 */
const siteUrlMatch = configuredSiteUrl.match(/^([a-z][a-z0-9+.-]*:\/\/[^/]+)(\/.*)?$/i)

/** 站点「源」地址：只有协议 + 域名，不带路径 */
const siteOrigin = siteUrlMatch ? siteUrlMatch[1] : configuredSiteUrl

/** siteConfig.url 里自带的那段部署路径（CI 用不到，本地回退时用） */
const configuredBasePath = (siteUrlMatch?.[2] ?? '').replace(/\/+$/, '')

/**
 * 部署子路径：
 * - 显式给了 NUXT_APP_BASE_URL（CI）→ 用它；
 * - 否则把 siteConfig.url 里带的那段路径取回来，这样本地不设该变量时，
 *   RSS 条目链接与 OG 图仍指向 /AI-Blog，而不是掉到域名根上。
 */
const basePath = process.env.NUXT_APP_BASE_URL ? basePrefix : configuredBasePath

/**
 * 站点完整地址 = 源 + 部署子路径，例如 https://<user>.github.io/<repo>。
 * RSS 的条目链接与 OG 图需要这种带路径的完整地址（爬虫不会替你补子路径）。
 */
const siteUrl = `${siteOrigin}${basePath}`

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxt/content',
    '@nuxt/fonts',
    '@nuxt/image',
    '@vueuse/nuxt',
    // SEO 三件套分别引入，不用 @nuxtjs/seo 全家桶：
    // 它的 og-image 会在构建期渲染图片，中文全字集体量下会把构建拖死。
    // 分享图改用静态图 public/og-default.png（scripts/gen-og-image.mjs 生成）。
    '@nuxtjs/sitemap',
    '@nuxtjs/robots',
    'nuxt-schema-org',
    'nuxt-seo-utils',
  ],

  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },

  // 组件按文件名注册（不带目录前缀），这样 components/site/ThemeToggle.vue
  // 在模板里就是 <ThemeToggle>，不用写 <SiteThemeToggle>。
  components: [{ path: '~/components', pathPrefix: false }],

  app: {
    // 部署在子路径时必须设置，否则静态资源与站内链接会整片 404
    baseURL,
    head: {
      // 浏览器只会自动去域名根请求 /favicon.ico，子路径部署时那份并不存在，
      // 所以这里显式声明一份。href 手动带上 baseURL，不依赖框架的自动改写。
      link: [{ rel: 'icon', type: 'image/x-icon', href: `${basePrefix}/favicon.ico` }],
      // 首屏同步恢复主题，避免刷新时白闪 / 掉色
      script: [
        {
          innerHTML:
            "try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');var a=localStorage.getItem('accent');if(a)document.documentElement.dataset.accent=a}catch(e){}",
        },
      ],
    },
  },

  // 公开运行时配置：应用组件与 server 路由都从这里读站点地址
  //
  // ⚠️ 键名刻意不叫 `siteUrl` —— Nuxt 会把环境变量 NUXT_PUBLIC_SITE_URL 映射到
  // runtimeConfig.public.siteUrl，而上面这个变量名又被 nuxt-site-config 占用（必须是
  // 「源地址」，不能带路径），于是 CI 里 runtimeConfig.public.siteUrl 读出来就是源地址，
  // 不含 /<repo>。曾经因此让 RSS 链接、OG 图、sitemap 修复全部丢掉子路径。
  // 拆成两个不会与 Nuxt 约定重名的键，各司其职。
  runtimeConfig: {
    public: {
      siteOrigin, // 'https://<user>.github.io'
      siteFullUrl: siteUrl, // 'https://<user>.github.io/<repo>'
    },
  },

  // 子路径里带大写字母时（仓库名 AI-Blog → /AI-Blog/）必须关掉这个：
  // nuxt-seo-utils 默认会把 canonical 链接整体小写化，而 GitHub Pages 的路径
  // 区分大小写，/ai-blog 是 404，等于自己把 canonical 指向了死链。
  seo: {
    canonicalLowercase: false,
  },

  // ── sitemap：排除加密专区 ──────────────────────────────────────────
  // /vault 是一个真实页面路由，@nuxtjs/sitemap 默认会把所有路由收进来。
  // 虽然 robot noindex 能挡住大部分爬虫，但 sitemap 里出现这条 URL 本身
  // 就等于「告诉全世界这里有个加密专区」，与「完全隐藏」的决策相悖。
  sitemap: {
    exclude: ['/vault'],
  },

  // @nuxtjs/robots 在设置了 baseURL 时会直接报错：
  //   "You are not allowed to generate a robots.txt with a base URL"
  // 因为 robots.txt 必须位于域名根，模块无法保证这一点。
  // 所以只在根路径部署时生成；子路径部署（GitHub Pages 项目页）本就读不到它。
  robots: {
    robotsTxt: baseURL === '/',
    // /vault（加密专区）禁止被任何爬虫收录。
    // 注意：这只是「请求爬虫别收」，不是访问控制 —— 真正的保护是内容加密。
    disallow: ['/vault'],
  },

  // SEO 模块读取的站点信息（注意 url 只能用「源」地址，不能带路径）
  site: {
    url: siteOrigin,
    name: siteConfig.name,
    description: siteConfig.description,
    defaultLocale: 'zh-CN',
  },

  // 字体全部走本地子集（public/fonts）：不依赖 Google/Bunny，
  // 国内访问稳定，OG 图渲染也不会因为拉不到字体而 500。
  fonts: {
    provider: 'local',
    families: [
      { name: 'Inter', src: '/fonts/inter-400.woff2', weight: 400, global: true },
      { name: 'Inter', src: '/fonts/inter-700.woff2', weight: 700, global: true },
      { name: 'Noto Sans SC', src: '/fonts/noto-sc-400.woff2', weight: 400, global: true },
      { name: 'Noto Sans SC', src: '/fonts/noto-sc-700.woff2', weight: 700, global: true },
      {
        name: 'Noto Serif SC',
        src: '/fonts/noto-serif-sc-400.woff2',
        weight: 400,
        global: true,
      },
      {
        name: 'Noto Serif SC',
        src: '/fonts/noto-serif-sc-700.woff2',
        weight: 700,
        global: true,
      },
    ],
  },

  content: {
    build: {
      markdown: {
        // 目录生成到三级标题
        toc: { depth: 3, searchDepth: 3 },
      },
    },
    // ── 构建期用哪种 sqlite 驱动 ────────────────────────────────────────
    //
    // @nuxt/content 在构建期要建一个本地 sqlite 库存内容索引。它有四个候选：
    //   'bun'            → Bun 内置 sqlite（只有 Bun 运行时才有）
    //   'native'         → Node 22.5+ 内置的 node:sqlite（**无需编译**）
    //   'sqlite3'        → sqlite3 包（需要原生编译）
    //   'better-sqlite3' → better-sqlite3 包（需要原生编译，**默认兜底**）
    //
    // 不指定时它走最后一个兜底分支（见 node_modules/@nuxt/content/dist/module.mjs
    // 的 findBestSqliteAdapter），即强制用 better-sqlite3。
    //
    // ⚠️ 这就是 Vercel 构建 SIGABRT 的根因（2026-10-08）：
    //   Vercel 构建机上的 Node 与本地 Node 的 ABI 不一致，
    //   better-sqlite3 的原生绑定在进程退出时崩在
    //   `node::RemoveEnvironmentCleanupHook ... Assertion failed: (env) != nullptr`
    //   → `error: script "build" was terminated by signal SIGABRT (Abort)`
    //   注意崩溃点是 **Statement 析构函数**，说明绑定本身加载成功了，
    //   是退出阶段的清理钩子对不上 —— 典型的原生模块 ABI 漂移。
    //
    // 改用 'native' 就整条绕开原生编译：走 Node 自带的 node:sqlite，
    // 与 Node 版本天然匹配，没有 ABI 问题，也不需要 prebuild/gyp。
    // 本地实测 node:sqlite 可用（Node 22.22.2，读写正常）。
    //
    // 顺带一提：content 会自己吞掉 node:sqlite 的 ExperimentalWarning
    // （见 module.mjs 里 isNodeSqliteAvailable 对 process.emit 的包装），
    // 所以不会刷一屏实验性警告。
    experimental: {
      sqliteConnector: 'native',
    },
  },

  // ── 旧 URL 301 重定向 ──────────────────────────────────────────────
  //
  // 背景（2026-10-03）：Nuxt Content 用 slugify 从**文件名**生成 path，而 slugify
  // 会丢光中文。当时的三个中文文件名塌缩成了下面的残片，其中
  // `/blog/ai` 被两篇文章同时算出（「AI灵犀工作台」与「AI自动化找工作」）
  // → 互相覆盖 → 「新建文章保存后封面变了，点进去却是上一篇的内容」。
  // 修复手段：把内容文件名全部改成 ASCII（见 scripts/check-content-filenames.mjs），
  // 并在 public/admin/config.yml 给两个 collection 配 slug 模板，防止以后复发。
  //
  // 这里给旧地址留 301，保住外链 / 搜索引擎收录 / 旧分享：
  //
  //   /blog/ai                   旧塌缩残片（原属「AI灵犀工作台」）→ /blog/ai-lingxi-workbench
  //   /blog/c                    旧塌缩残片（原属「C盘爆了」）      → /blog/c-drive-full-rescue
  //   /blog/playwright-chrome-cdp 旧 URL（中文冒号截断了前半段）    → /blog/playwright-user-chrome-cdp
  //
  // ⚠️ 关于 /blog/ai 的取舍：这个地址历史上被两篇文章共用过，指向哪一篇都是
  //    「将错就错」。「AI灵犀工作台」（2026-08-13）是更早、更可能被外链引用的那篇，
  //    所以跳它。若你更想把 /blog/ai 给「AI自动化找工作」，改下面这一行即可。
  //
  // 这些规则可以长期保留，成本接近零（静态站只生成 3 个跳转页）。
  //
  // ⚠️ 跳转目标必须**手动带上 basePrefix**（和上面 favicon 的 href 同理）。
  // 静态导出时 Nitro 把 `to` 原样写进跳转页的
  //   <meta http-equiv="refresh" content="0; url=<to>">
  // **不会**替你补 app.baseURL。曾经写的是不带前缀的 '/blog/ai-lingxi-workbench'，
  // 线上跳转页于是写着 url=/blog/ai-lingxi-workbench；而站点在 /AI-Blog/ 下，
  // 结果跳到 https://<user>.github.io/blog/... → **404**，这套 301 等于白做。
  routeRules: {
    '/blog/ai': {
      redirect: { to: `${basePrefix}/blog/ai-lingxi-workbench`, statusCode: 301 },
    },
    '/blog/c': {
      redirect: { to: `${basePrefix}/blog/c-drive-full-rescue`, statusCode: 301 },
    },
    '/blog/playwright-chrome-cdp': {
      redirect: { to: `${basePrefix}/blog/playwright-user-chrome-cdp`, statusCode: 301 },
    },
    // ces.md 被改成 n8n-ai-customer-service.md，旧地址一并跳转
    '/blog/ces': {
      redirect: { to: `${basePrefix}/blog/n8n-ai-customer-service`, statusCode: 301 },
    },
  },

  // 静态生成时预渲染全部文章路由
  // /search-index.json 是关键：它把全站搜索变成「读一个静态 JSON」，
  // 这样纯静态托管（对象存储 / CDN / Pages）也能搜索，不依赖 Node 服务端。
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: [
        '/',
        '/blog',
        '/projects',
        '/about',
        '/tags',
        '/rss.xml',
        '/sitemap.xml',
        '/search-index.json',
        // 旧 URL 的重定向页。crawlLinks 爬不到它们（站内已无链接指向旧地址），
        // 必须显式列出才会生成对应的 HTML 跳转文件。
        '/blog/ai',
        '/blog/c',
        '/blog/ces',
        '/blog/playwright-chrome-cdp',
      ],
    },
  },
})