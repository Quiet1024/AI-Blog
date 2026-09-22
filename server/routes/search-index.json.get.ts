/**
 * 静态搜索索引。
 *
 * 构建时被预渲染成一个普通的 JSON 文件（见 nuxt.config.ts 的 nitro.prerender.routes），
 * 浏览器端直接 fetch 它、在本地打分排序。好处：
 *   1. 纯静态托管（对象存储 / CDN / Pages）也能搜索 —— 不再依赖 Node 服务端；
 *   2. 输入即出结果，没有每次击键的网络往返；
 *   3. 站点挂了服务端，搜索仍然可用。
 *
 * 注意：草稿（draft: true）不进索引。
 */
interface IndexItem {
  title: string
  path: string
  description: string
  tags: string[]
  text: string
  date: string
}

/** 单篇正文进索引的上限，避免索引文件无限膨胀 */
const MAX_BODY_CHARS = 20_000

function plainText(body: unknown): string {
  if (!body) return ''
  return JSON.stringify(body)
    .replace(/\\n/g, '\n')
    .replace(/[{}[\]"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default defineEventHandler(async (event) => {
  const posts = (await queryCollection(event, 'posts').order('date', 'DESC').all()) as any[]

  const items: IndexItem[] = posts
    .filter((p) => !p.draft)
    .map((p) => ({
      title: String(p.title || ''),
      path: String(p.path || ''),
      description: String(p.description || ''),
      tags: Array.isArray(p.tags) ? p.tags : [],
      text: plainText(p.body).slice(0, MAX_BODY_CHARS),
      date: String(p.date || ''),
    }))

  // 让 CDN / 浏览器缓存住，但内容更新后能及时失效
  setHeader(event, 'cache-control', 'public, max-age=0, must-revalidate')
  return items
})
