import type { Ref } from 'vue'

/** 文章的最小可用类型（与 content.config.ts 的 posts schema 对应） */
export interface PostItem {
  id: string
  path: string
  stem?: string
  title: string
  description: string
  date: string
  updated?: string
  tags: string[]
  cover?: string
  featured: boolean
  draft: boolean
  serif: boolean
  author?: string
  body?: unknown
}

export interface ProjectItem {
  name: string
  summary: string
  role: string
  year: string
  stack: string[]
  link?: string
  cover?: string
  accent: string
  order: number
}

const toArray = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : [])

/** 已发布文章，按日期倒序 */
export async function fetchPosts(): Promise<PostItem[]> {
  const { data } = await useAsyncData('posts:all', () =>
    queryCollection('posts').order('date', 'DESC').all(),
  )
  const list = (data.value || []) as unknown as PostItem[]
  return list
    .filter((p) => !p.draft)
    .map((p) => ({ ...p, tags: toArray<string>(p.tags) }))
}

/** 首页用：头条（最新 featured）+ 其余列表 */
export async function fetchHomePosts() {
  const posts = await fetchPosts()
  const featured = posts.find((p) => p.featured) || posts[0]
  const rest = posts.filter((p) => p.id !== featured?.id)
  return { posts, featured: featured as PostItem | undefined, rest }
}

/** 全部标签 + 每篇数量（用于标签云和标签页） */
export function collectTags(posts: PostItem[]) {
  const map = new Map<string, number>()
  for (const p of posts) for (const t of p.tags) map.set(t, (map.get(t) || 0) + 1)
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** 作品集条目 */
export async function fetchProjects(): Promise<ProjectItem[]> {
  const { data } = await useAsyncData('projects:all', () =>
    queryCollection('projects').order('order', 'ASC').all(),
  )
  return ((data.value || []) as unknown as ProjectItem[]).map((p) => ({
    ...p,
    stack: toArray<string>(p.stack),
  }))
}

/** 中文日期：2026年9月22日 */
export function formatDate(input: string | Date | undefined) {
  if (!input) return ''
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return String(input)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/** 估算阅读时长：中文按 350 字/分钟 */
export function readingTime(body: unknown): string {
  if (!body) return '1 分钟'
  const text = JSON.stringify(body)
    .replace(/\\n/g, ' ')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9 ]/g, ' ')
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const words = (text.match(/[a-zA-Z0-9]+/g) || []).length
  const minutes = Math.max(1, Math.round(cjk / 350 + words / 220))
  return `${minutes} 分钟`
}

/** 分页辅助 */
export function paginate<T>(items: T[], page: number, perPage: number) {
  const total = Math.ceil(items.length / perPage) || 1
  const current = Math.min(Math.max(page, 1), total)
  const start = (current - 1) * perPage
  return {
    items: items.slice(start, start + perPage),
    current,
    total,
    hasPrev: current > 1,
    hasNext: current < total,
  }
}

/** 类型收窄用：把 Ref<any> 当 PostItem[] 用 */
export function asPosts(refLike: Ref<unknown> | unknown) {
  return refLike as Ref<PostItem[] | null>
}
