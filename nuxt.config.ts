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
 * 站点「源」地址：只有协议 + 域名，**不带路径**。
 *
 * 变量名不要改 —— nuxt-site-config 自己就认 NUXT_PUBLIC_SITE_URL 这个环境变量，
 * 并且明确要求它不含路径（含了会在构建期报 "should not contain a path" 警告）。
 * 而 sitemap 生成 <loc> 时会自己把 app.baseURL 拼上去
 * （模块内 createSitePathResolver 传了 withBase: true），所以子路径交给 baseURL。
 */
const siteOrigin = (process.env.NUXT_PUBLIC_SITE_URL || siteConfig.url).replace(/\/+$/, '')

/**
 * 站点完整地址 = 源 + 部署子路径，例如 https://<user>.github.io/<repo>。
 * RSS 的条目链接与 OG 图需要这种带路径的完整地址（爬虫不会替你补子路径）。
 */
const siteUrl = `${siteOrigin}${basePrefix}`

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

  // 公开运行时配置：应用组件与 server 路由都从这里读站点完整地址
  runtimeConfig: {
    public: { siteUrl },
  },

  // @nuxtjs/robots 在设置了 baseURL 时会直接报错：
  //   "You are not allowed to generate a robots.txt with a base URL"
  // 因为 robots.txt 必须位于域名根，模块无法保证这一点。
  // 所以只在根路径部署时生成；子路径部署（GitHub Pages 项目页）本就读不到它。
  robots: {
    robotsTxt: baseURL === '/',
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
      ],
    },
  },
})
