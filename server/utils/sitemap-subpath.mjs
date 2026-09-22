/**
 * 子路径部署（如 GitHub Pages 项目页 /<repo>/）时，修正 sitemap 里的两类错误 URL。
 *
 * 详细成因见 server/plugins/sitemap-subpath-fix.ts 里的长注释。
 * 这里刻意抽成一个「不依赖任何 Nuxt 运行时」的纯函数，
 * 因为这台机器上 nuxt generate 不稳定，验证只能脱离构建单独跑
 * （见 scripts/verify-sitemap-subpath.mjs）。
 *
 * ⚠️ 参数只用 siteOrigin（源地址，协议+域名）与 basePrefix（子路径）。
 * 不要改用 runtimeConfig.public.siteUrl —— 那个键会被环境变量
 * NUXT_PUBLIC_SITE_URL 覆盖成不带路径的源地址，拿它算「被重复的那一段」
 * 会算错，把正常 URL 截断成垃圾（这个坑真的踩过一次）。
 *
 * @param {Array} urls  sitemap:resolved 钩子拿到的条目（loc 已是绝对地址）
 * @param {{ siteOrigin?: string, basePrefix: string }} ctx
 *        siteOrigin 'https://<user>.github.io'
 *        basePrefix '/<repo>'
 */
export function fixSubpathSitemapUrls(urls, { siteOrigin, basePrefix }) {
  if (!Array.isArray(urls) || !basePrefix || basePrefix === '/') return urls

  const origin = String(siteOrigin || '').replace(/\/+$/, '')
  const fullPrefix = `${origin}${basePrefix}` // 'https://<user>.github.io/<repo>'
  const doubled = `${basePrefix}${basePrefix}` // '/<repo>/<repo>'

  for (const url of urls) {
    if (!url || typeof url !== 'object' || typeof url.loc !== 'string') continue

    // 问题 1：首页被多拼了一段 base，例如
    //   https://u.github.io/repo/repo        → https://u.github.io/repo
    //   https://u.github.io/repo/repo/about  → https://u.github.io/repo/about
    //
    // 用「找到重复段、只删掉其中一段」的写法，而不是从末尾截掉固定长度：
    // 后者一旦前缀判断失准，就会把正常 URL 截断成垃圾。
    const at = url.loc.indexOf(doubled)
    if (at > 0 && (!origin || url.loc.startsWith(origin))) {
      url.loc = url.loc.slice(0, at) + url.loc.slice(at + basePrefix.length)
      // _key 是模块后面用来去重的键，而且是在解析前算好的，这里必须同步更新，
      // 否则它认不出「这条和被多拼的那一条其实是同一个地址」，会留下两条重复项。
      if (typeof url._key === 'string') {
        url._key = `${url._sitemap || ''}${url.loc.replace(/\/+$/, '')}`
      }
    }

    // 问题 2：图片地址漏了子路径，例如
    //   https://u.github.io/_ipx/...  →  https://u.github.io/repo/_ipx/...
    if (origin && Array.isArray(url.images)) {
      for (const image of url.images) {
        if (typeof image?.loc !== 'string') continue
        if (image.loc.startsWith(`${origin}/`) && !image.loc.startsWith(`${fullPrefix}/`)) {
          image.loc = `${fullPrefix}${image.loc.slice(origin.length)}`
        }
      }
    }
  }

  return urls
}
