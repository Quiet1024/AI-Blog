/**
 * 全文搜索：命中标题/摘要/标签/正文，按分值排序，返回带上下文片段的结果。
 * 中文用子串匹配（分词器对短查询并不划算），英文按词匹配，够用且不引额外依赖。
 */
interface Result {
  title: string
  path: string
  description: string
  tags: string[]
  snippet: string
  score: number
}

function plainText(body: unknown): string {
  if (!body) return ''
  return JSON.stringify(body)
    .replace(/\\n/g, '\n')
    .replace(/[{}[\]"]/g, ' ')
    .replace(/\s+/g, ' ')
}

function makeSnippet(text: string, query: string, radius = 48) {
  const at = text.toLowerCase().indexOf(query.toLowerCase())
  if (at < 0) return text.slice(0, radius * 2)
  const start = Math.max(0, at - radius)
  return (start > 0 ? '…' : '') + text.slice(start, at + query.length + radius) + '…'
}

export default defineEventHandler(async (event) => {
  const q = String(getQuery(event).q || '').trim()
  if (!q) return { results: [] as Result[] }

  const posts = (await queryCollection(event, 'posts')
    .order('date', 'DESC')
    .all()) as any[]

  const lower = q.toLowerCase()
  const results: Result[] = []

  for (const post of posts) {
    if (post.draft) continue

    const title = String(post.title || '')
    const description = String(post.description || '')
    const tags: string[] = Array.isArray(post.tags) ? post.tags : []
    const bodyText = plainText(post.body)

    let score = 0
    if (title.toLowerCase().includes(lower)) score += 8
    if (tags.some((t) => t.toLowerCase().includes(lower))) score += 4
    if (description.toLowerCase().includes(lower)) score += 3
    if (bodyText.toLowerCase().includes(lower)) score += 1
    if (!score) continue

    results.push({
      title,
      path: post.path,
      description,
      tags,
      snippet: makeSnippet(description || bodyText, q),
      score,
    })
  }

  results.sort((a, b) => b.score - a.score)
  return { results: results.slice(0, 10) }
})
