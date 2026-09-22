import { siteConfig } from '../../app/data/site'

/** RSS 2.0：/rss.xml */
export default defineEventHandler(async (event) => {
  const posts = (await queryCollection(event, 'posts')
    .order('date', 'DESC')
    .all()) as any[]

  // 站点地址走运行时配置：部署时用 baseURL + 源地址注入即可，不用改源码。
  //
  // 这里读的是 siteFullUrl 而不是 siteUrl —— NUXT_PUBLIC_SITE_URL 会被 Nuxt
  // 映射到 runtimeConfig.public.siteUrl，而那个变量只能放「源地址」（不带路径），
  // 于是 RSS 里的链接会丢掉 /<repo> 子路径。详见 nuxt.config.ts。
  const site = String(useRuntimeConfig(event).public.siteFullUrl || siteConfig.url).replace(
    /\/+$/,
    '',
  )
  const esc = (s: string) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const items = posts
    .filter((p) => !p.draft)
    .map((p) => {
      const url = `${site}${p.path}`
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="true">${esc(url)}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description>${esc(p.description || '')}</description>
${(Array.isArray(p.tags) ? p.tags : []).map((t) => `      <category>${esc(t)}</category>`).join('\n')}
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(siteConfig.name)}</title>
    <link>${esc(site)}</link>
    <description>${esc(siteConfig.description)}</description>
    <language>${esc(siteConfig.locale)}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${esc(site)}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`

  setHeader(event, 'content-type', 'application/rss+xml; charset=utf-8')
  return xml
})
