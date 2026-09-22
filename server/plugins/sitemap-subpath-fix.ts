import { fixSubpathSitemapUrls } from '../utils/sitemap-subpath.mjs'

/**
 * 修掉「子路径部署」时 @nuxtjs/sitemap 产出的两处错误 URL。
 *
 * 只在 app.baseURL !== '/' 时生效（GitHub Pages 项目页 / 子目录托管）；
 * 根路径部署时整个插件是空操作，可以放心留着。
 *
 * ── 问题 1：首页在 sitemap 里被重复成 /<repo>/<repo>
 *
 * 成因（@nuxtjs/sitemap v8.5.1，已在 node_modules 里逐层核对）：
 *   1. Nitro 预渲染时，首页被记录为「带前缀 + 带尾斜杠」的形式，例如 '/my-blog/'；
 *   2. 组装时 preNormalizeEntry 会先 removeTrailingSlash → '/my-blog/' 变成 '/my-blog'；
 *   3. 随后 site-config-stack 的 resolveSitePath 用 `path.startsWith(base)` 判断
 *      「是否已经带过前缀」，而 base 是 '/my-blog/'（保留尾斜杠），
 *      此刻的 path 却是 '/my-blog'（尾斜杠已被上一步削掉）→ 判断失败；
 *   4. 于是 '/my-blog' 被当成相对路径再拼一次 base，
 *      产出 https://<user>.github.io/my-blog/my-blog 这种并不存在的地址。
 *
 * 其它页面（/my-blog/about 等）本来就不带尾斜杠，第 2 步是空操作，
 * 前缀判断正常，所以只有首页会中招 —— 这也解释了为什么 sitemap 里
 * 只有首页多出一条。
 *
 * ── 问题 2：图片地址漏了子路径前缀
 *
 * <image:image> 里的头像地址是 https://<user>.github.io/_ipx/...，
 * 少了 /my-blog 这一段，而产物里的文件其实在 /my-blog/_ipx/...，所以是 404。
 *
 * ── 具体修法见 server/utils/sitemap-subpath.mjs（抽成纯函数方便单独验证）
 *
 * 另外：钩子拿到的 loc 已经是绝对地址，且数组长度不变 → 模块不会重新归一化，
 * 所以去重用的 _key 需要在修函数里一起更新。
 *
 * ⚠️ 踩过的坑：这里一开始用 runtimeConfig.public.siteUrl 当「站点完整地址」，
 * 但 CI 会设置 NUXT_PUBLIC_SITE_URL（nuxt-site-config 要求它只能是「源地址」），
 * Nuxt 又把它映射到 runtimeConfig.public.siteUrl，于是插件拿到的是源地址，
 * 「被重复的那段 base」算错，**把线上 sitemap 里每条 URL 都截断了**。
 * 现在只用 siteOrigin + app.baseURL，两者都不会被环境变量覆盖。
 */
export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  const baseURL = config.app.baseURL || '/'
  if (baseURL === '/') return

  const basePrefix = baseURL.replace(/\/+$/, '') // '/<repo>'
  if (!basePrefix) return

  // 只取 siteOrigin。别用 runtimeConfig.public.siteUrl ——
  // 它会被环境变量 NUXT_PUBLIC_SITE_URL 覆盖成不带路径的源地址，
  // 拿它去算「被重复的那段 base」会算错、把正常 URL 截断。
  const siteOrigin = String(config.public.siteOrigin || '').replace(/\/+$/, '')

  nitroApp.hooks.hook('sitemap:resolved', (ctx) => {
    fixSubpathSitemapUrls(ctx?.urls || [], { siteOrigin, basePrefix })
  })
})
