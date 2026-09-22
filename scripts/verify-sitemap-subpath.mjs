/**
 * 验证 server/utils/sitemap-subpath.mjs 的子路径修复是否真的生效。
 *
 * 为什么要这么验：这台机器上 `nuxt generate` 不稳定（会卡在 Nitro 预渲染阶段），
 * 不方便用整包构建做回归；而这个问题又恰恰只能在子路径部署时才暴露。
 *
 * 做法：不使用任何「自己写的近似逻辑」，而是直接把 @nuxtjs/sitemap 自己的
 * 运行时代码拉起来，按它在真实构建里的调用顺序跑一遍：
 *
 *   1. preNormalizeEntry()      ← 对应模块里 resolveSitemapEntries 对每个条目的处理
 *   2. fixSubpathSitemapUrls()  ← 我们的修复（开关可对比）
 *   3. normaliseEntry()         ← 对应模块在 sitemap:resolved 之后的归一化
 *   4. mergeOnKey(_key)         ← 对应模块的最终去重
 *
 * 输入取的是模块自己在真实构建里记录的「nuxt:prerender」源条目
 * （即 node_modules/.cache/nuxt/sitemap/global-sources.json 的内容，
 * 含带前缀与不带前缀两套）。下面内联的是从那次构建产物里逐字抄下来的夹具，
 * 若缓存文件还在则优先用实时文件。
 *
 * 判据分三组：
 *   A. 修复前必须能复现 Bug（多出一条 /<repo>/<repo>）—— 复现不出来说明验证本身无效
 *   B. 修复后首页只剩一条、无重复、图片地址带上子路径
 *   C. 不含重复段的正常 URL 必须逐字不变
 *      （这条是补的回归测试：曾经用「按固定长度截尾」实现，
 *        前缀判断一旦失准就把线上 sitemap 里每条 URL 都截断了）
 *
 * 用法：node scripts/verify-sitemap-subpath.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { fixSubpathSitemapUrls } from '../server/utils/sitemap-subpath.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const toFileUrl = (p) => new URL(`file:///${p.replace(/\\/g, '/')}`).href

const SITEMAP_RT = resolve(root, 'node_modules/@nuxtjs/sitemap/dist/runtime')
const { preNormalizeEntry, normaliseEntry } = await import(
  toFileUrl(resolve(SITEMAP_RT, 'server/sitemap/urlset/normalise.js'))
)
const { mergeOnKey } = await import(toFileUrl(resolve(SITEMAP_RT, 'utils-pure.js')))
const { resolveSitePath, fixSlashes } = await import(
  toFileUrl(resolve(root, 'node_modules/site-config-stack/dist/urls.mjs'))
)

// ── 与真实构建一致的参数（对应 NUXT_APP_BASE_URL=/AI-Blog/ + NUXT_PUBLIC_SITE_URL=源地址）
const baseURL = '/AI-Blog/'
const basePrefix = baseURL.replace(/\/+$/, '')
const siteOrigin = 'https://quiet1024.github.io' // 只到域名，不带路径
const siteUrl = `${siteOrigin}${basePrefix}`

// 对应 createSitePathResolver() 造出来的两个解析器
const resolvers = {
  fixSlashes: (p) => fixSlashes(false, p),
  canonicalUrlResolver: (p) =>
    resolveSitePath(p, {
      canonical: true,
      absolute: true,
      withBase: true,
      siteUrl: siteOrigin,
      trailingSlash: false,
      base: baseURL,
    }),
}

// ── 输入：模块在真实构建里记录的 nuxt:prerender 源条目
const AVATAR = `${siteOrigin}/_ipx/s_96x96/avatar.svg`
const FIXTURE = [
  // 不带前缀的（来自 nitro.prerender.routes 里声明的字面路径）
  '/blog',
  { loc: '/about', images: [{ loc: AVATAR }] },
  '/tags',
  '/projects',
  '/',
  // 带前缀的（预渲染实际落到 baseURL 之下的地址）
  '/AI-Blog/tags/随笔',
  '/AI-Blog/tags/写作',
  '/AI-Blog/tags/设计',
  '/AI-Blog/tags/前端',
  '/AI-Blog/tags/AI',
  '/AI-Blog/tags/工程',
  '/AI-Blog/tags/排版',
  { loc: '/AI-Blog/blog/hello-nuxt-blog', lastmod: '2026-09-18' },
  '/AI-Blog/projects',
  '/AI-Blog/blog',
  { loc: '/AI-Blog/about', images: [{ loc: AVATAR }] },
  { loc: '/AI-Blog/blog/designer-writes-code', lastmod: '2026-09-12' },
  '/AI-Blog/', // ← 首页：带前缀 + 带尾斜杠，Bug 的起点
  { loc: '/AI-Blog/blog/ai-agent-memory', lastmod: '2026-09-05' },
  { loc: '/AI-Blog/blog/typography-checklist', lastmod: '2026-08-28' },
]

const livePath = resolve(root, 'node_modules/.cache/nuxt/sitemap/global-sources.json')
let rawUrls = FIXTURE
let source = '内联夹具（真实构建记录的条目）'
if (existsSync(livePath)) {
  const sources = JSON.parse(readFileSync(livePath, 'utf8'))
  const prerender = sources.find((s) => s.context?.name === 'nuxt:prerender')
  if (prerender?.urls?.length) {
    rawUrls = prerender.urls
    source = '实时缓存 global-sources.json'
  }
}

// ── 复刻模块的处理顺序
function run(input, { fix }) {
  const urls = input.map((u) => preNormalizeEntry(u, resolvers)) // 1
  if (fix) fixSubpathSitemapUrls(urls, { siteOrigin, basePrefix }) // 2
  const normalised = urls.map((u) => normaliseEntry(u, undefined, resolvers, undefined)) // 3
  return mergeOnKey(normalised, '_key', () => {}) // 4
}

const before = run(rawUrls, { fix: false })
const after = run(rawUrls, { fix: true })
const locs = (list) => list.map((u) => u.loc).sort()
const doubled = `${siteUrl}${basePrefix}`

console.log(`输入来源：${source}，条目 ${rawUrls.length} 条\n`)
console.log('=== 修复前 ===')
for (const u of locs(before)) console.log(' ', u, u.startsWith(doubled) ? '   ← 多拼了一段 base' : '')
console.log('\n=== 修复后 ===')
for (const u of locs(after)) console.log(' ', u)

const imagesBefore = [...new Set(before.flatMap((u) => (u.images || []).map((i) => i.loc)))]
const imagesAfter = [...new Set(after.flatMap((u) => (u.images || []).map((i) => i.loc)))]
console.log('\n=== 图片地址 ===')
console.log('  修复前:', imagesBefore.join(', ') || '(无)')
console.log('  修复后:', imagesAfter.join(', ') || '(无)')

// ── C 组：正常 URL 必须逐字不变（回归测试）
const untouchedSamples = [
  `${siteUrl}`,
  `${siteUrl}/about`,
  `${siteUrl}/blog/hello-nuxt-blog`,
  `${siteUrl}/tags/AI`,
  'https://example.com/whatever',
]
const snapped = untouchedSamples.map((loc) => ({ ...{ loc } }))
fixSubpathSitemapUrls(snapped, { siteOrigin, basePrefix })
const allUnchanged = snapped.every((u, i) => u.loc === untouchedSamples[i])

// ── 断言
const checks = [
  ['A 自检：修复前确实能复现出重复首页', locs(before).includes(doubled)],
  ['B 修复后不再有重复首页', !locs(after).some((l) => l.startsWith(doubled))],
  ['B 修复后首页仍在（没被误删）', locs(after).includes(siteUrl)],
  ['B 修复后首页只有一条', locs(after).filter((l) => l === siteUrl).length === 1],
  ['B 修复后没有任何重复地址', new Set(locs(after)).size === locs(after).length],
  ['B 修复后条目数 = 修复前 - 1', locs(after).length === locs(before).length - 1],
  ['B 图片地址已带上子路径', imagesAfter.length === 0 || imagesAfter.every((l) => l.startsWith(`${siteUrl}/`))],
  ['C 无重复段的正常 URL 逐字未变', allUnchanged],
  ['C 修复后每条 loc 都是完整地址（没被截断）', locs(after).every((l) => l.startsWith(`${siteUrl}/`) || l === siteUrl)],
]

console.log('')
let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (!ok) failed++
}
console.log(`\n${failed === 0 ? '全部通过' : `${failed} 项失败`}`)
process.exit(failed === 0 ? 0 : 1)
