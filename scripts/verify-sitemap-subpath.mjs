/**
 * 验证 server/utils/sitemap-subpath.mjs 的子路径修复是否真的生效。
 *
 * 为什么要这么验：这台机器上 `nuxt generate` 不稳定（会卡在 Nitro 预渲染阶段，
 * 实测两次各卡 5~10 分钟），所以不方便用整包构建做回归。
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
 * 判据：
 *   · 关闭修复 → 必须能复现出 Bug（多出一条 /<repo>/<repo>）
 *   · 打开修复 → 首页只剩一条、无重复、图片地址带上子路径
 * 前者是这套复现是否可信的自检：复现不出来，就说明验证本身无效。
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

// ── 与真实构建一致的参数（对应 NUXT_APP_BASE_URL=/my-blog/ + NUXT_PUBLIC_SITE_URL=源地址）
const baseURL = '/my-blog/'
const basePrefix = baseURL.replace(/\/+$/, '')
const siteOrigin = 'https://someuser.github.io' // 只到域名，不带路径
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
const AVATAR = 'https://someuser.github.io/_ipx/s_96x96/avatar.svg'
const FIXTURE = [
  // 不带前缀的（来自 nitro.prerender.routes 里声明的字面路径）
  '/blog',
  { loc: '/about', images: [{ loc: AVATAR }] },
  '/tags',
  '/projects',
  '/',
  // 带前缀的（预渲染实际落到 baseURL 之下的地址）
  '/my-blog/tags/随笔',
  '/my-blog/tags/写作',
  '/my-blog/tags/设计',
  '/my-blog/tags/前端',
  '/my-blog/tags/AI',
  '/my-blog/tags/工程',
  '/my-blog/tags/排版',
  { loc: '/my-blog/blog/hello-nuxt-blog', lastmod: '2026-09-18' },
  '/my-blog/projects',
  '/my-blog/blog',
  { loc: '/my-blog/about', images: [{ loc: AVATAR }] },
  { loc: '/my-blog/blog/designer-writes-code', lastmod: '2026-09-12' },
  '/my-blog/', // ← 首页：带前缀 + 带尾斜杠，Bug 的起点
  { loc: '/my-blog/blog/ai-agent-memory', lastmod: '2026-09-05' },
  { loc: '/my-blog/blog/typography-checklist', lastmod: '2026-08-28' },
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
  if (fix) fixSubpathSitemapUrls(urls, { siteUrl, basePrefix }) // 2
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

// ── 断言
const checks = [
  ['自检：修复前确实能复现出重复首页', locs(before).includes(doubled)],
  ['修复后不再有重复首页', !locs(after).some((l) => l.startsWith(doubled))],
  ['修复后首页仍在（没被误删）', locs(after).includes(siteUrl)],
  ['修复后首页只有一条', locs(after).filter((l) => l === siteUrl).length === 1],
  ['修复后没有任何重复地址', new Set(locs(after)).size === locs(after).length],
  ['修复后条目数 = 修复前 - 1', locs(after).length === locs(before).length - 1],
  ['图片地址已带上子路径', imagesAfter.length === 0 || imagesAfter.every((l) => l.startsWith(`${siteUrl}/`))],
]

console.log('')
let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (!ok) failed++
}
console.log(`\n${failed === 0 ? '全部通过' : `${failed} 项失败`}`)
process.exit(failed === 0 ? 0 : 1)
