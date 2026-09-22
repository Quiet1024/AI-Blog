/**
 * 子路径部署（如 GitHub Pages 项目页 /<repo>/）时，修正 sitemap 里的两类错误 URL。
 *
 * 详细成因见 server/plugins/sitemap-subpath-fix.ts 里的长注释。
 * 这里刻意抽成一个「不依赖任何 Nuxt 运行时」的纯函数，
 * 因为这台机器上 nuxt generate 不稳定，验证只能脱离构建单独跑
 * （见 scripts/verify-sitemap-subpath.mjs）。
 *
 * @param {Array} urls        sitemap:resolved 钩子拿到的条目（loc 已是绝对地址）
 * @param {{ siteUrl: string, basePrefix: string }} ctx
 *        siteUrl    'https://<user>.github.io/<repo>'（含子路径）
 *        basePrefix '/<repo>'
 */
export function fixSubpathSitemapUrls(urls, { siteUrl, basePrefix }) {
  if (!Array.isArray(urls) || !siteUrl || !basePrefix || basePrefix === '/') return urls

  const origin = siteUrl.slice(0, siteUrl.length - basePrefix.length) // 'https://<user>.github.io'
  const doubled = `${siteUrl}${basePrefix}` // 被多拼了一次 base 的前缀

  for (const url of urls) {
    if (!url || typeof url !== 'object' || typeof url.loc !== 'string') continue

    // 问题 1：首页被多拼了一段 base，例如
    //   https://u.github.io/my-blog/my-blog  →  https://u.github.io/my-blog
    // 去掉后它会和本来就存在的正确条目合并（模块按 _key 去重），
    // 而 _key 是在解析前算好的，这里必须同步更新，否则去重认不出来。
    if (url.loc.startsWith(doubled)) {
      url.loc = url.loc.slice(0, url.loc.length - basePrefix.length)
      if (typeof url._key === 'string') {
        url._key = `${url._sitemap || ''}${url.loc.replace(/\/+$/, '')}`
      }
    }

    // 问题 2：图片地址漏了子路径，例如
    //   https://u.github.io/_ipx/...  →  https://u.github.io/my-blog/_ipx/...
    if (Array.isArray(url.images)) {
      for (const image of url.images) {
        if (typeof image?.loc !== 'string') continue
        if (image.loc.startsWith(`${origin}/`) && !image.loc.startsWith(`${siteUrl}/`)) {
          image.loc = `${siteUrl}${image.loc.slice(origin.length)}`
        }
      }
    }
  }

  return urls
}
