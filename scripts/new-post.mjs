#!/usr/bin/env node
/**
 * 新建文章脚手架 —— 把「开始写」这一步压缩成一条命令。
 *
 * 用法：
 *   bun run new "文章标题"
 *   bun run new "文章标题" --slug my-post --tags 随笔,设计
 *   bun run new "草稿标题" --draft
 *
 * 行为：
 *   在 content/posts/ 下生成 <slug>.md，frontmatter 已按 content.config.ts 的
 *   schema 填好（不会因为空字段触发校验失败），正文预置一个小骨架。
 *   文件名 = 网址，即 /blog/<slug>。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const POSTS_DIR = path.join(ROOT, 'content', 'posts')

const USAGE = `
新建一篇文章

  bun run new "文章标题" [选项]

选项
  --slug <名字>    指定网址用的英文名（不写则从标题里的英文字符推导）
  --tags <a,b>     标签，逗号分隔（中文逗号也行）
  --draft          标记为草稿（不进列表 / RSS / 搜索）
  --featured       放到首页头条位
  --no-serif       正文用无衬线体（默认衬线）
  --date <日期>     指定日期，格式 2026-09-22（默认今天）

例
  bun run new "为什么我又把博客重写了一遍" --slug rewrite-my-blog --tags 随笔,写作
`.trim()

// ---------- 参数解析 ----------
const argv = process.argv.slice(2)
const opts = { slug: '', tags: [], draft: false, featured: false, serif: true, date: '' }
const positional = []

for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--slug') opts.slug = argv[++i] ?? ''
  else if (a === '--tags') opts.tags = String(argv[++i] ?? '').split(/[,，\s]+/).filter(Boolean)
  else if (a === '--draft') opts.draft = true
  else if (a === '--featured') opts.featured = true
  else if (a === '--no-serif') opts.serif = false
  else if (a === '--date') opts.date = argv[++i] ?? ''
  else if (a === '-h' || a === '--help') {
    console.log(USAGE)
    process.exit(0)
  } else if (a.startsWith('--')) {
    console.error(`未知参数：${a}\n\n${USAGE}`)
    process.exit(1)
  } else positional.push(a)
}

const title = positional.join(' ').trim()
if (!title) {
  console.error(`缺少文章标题\n\n${USAGE}`)
  process.exit(1)
}

// ---------- 工具 ----------
const pad = (n) => String(n).padStart(2, '0')
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 把任意字符串收敛成 URL 友好的片段（只保留 a-z 0-9 与连字符） */
function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** YAML 双引号标量：JSON 的转义规则与 YAML 双引号兼容，直接复用 */
const yamlStr = (s) => JSON.stringify(String(s))

/** 从 site.ts 取作者名，让文章署名与站点保持一致 */
async function readAuthor() {
  try {
    const src = await readFile(path.join(ROOT, 'app', 'data', 'site.ts'), 'utf8')
    const m = src.match(/author\s*:\s*\{[\s\S]{0,300}?name\s*:\s*['"`]([^'"`]+)['"`]/)
    return m ? m[1] : ''
  } catch {
    return ''
  }
}

// ---------- 决定文件名 ----------
let slug = slugify(opts.slug)
let slugIsPlaceholder = false

if (!slug) {
  slug = slugify(title)
  if (!slug) {
    // 标题里没有可用作网址的英文字符（纯中文标题）
    slug = `post-${(opts.date || today()).replace(/-/g, '')}`
    slugIsPlaceholder = true
  }
}

let file = path.join(POSTS_DIR, `${slug}.md`)
let n = 1
while (existsSync(file)) {
  file = path.join(POSTS_DIR, `${slug}-${n}.md`)
  n++
}
const finalSlug = path.basename(file, '.md')

// ---------- 生成内容 ----------
const date = opts.date || today()
const author = await readAuthor()

const front = [
  '---',
  `title: ${yamlStr(title)}`,
  'description: ""',
  `date: ${date}`,
  `tags: [${opts.tags.map(yamlStr).join(', ')}]`,
  `featured: ${opts.featured}`,
  `draft: ${opts.draft}`,
  `serif: ${opts.serif}`,
]
if (author) front.push(`author: ${yamlStr(author)}`)
front.push('---')

const body = `

正文从这里开始，删掉这一行直接写。

## 一个小标题

- 要点一
- 要点二

> 想让人记住的一句话，可以放这里。
`

await mkdir(POSTS_DIR, { recursive: true })
await writeFile(file, front.join('\n') + body, 'utf8')

// ---------- 反馈 ----------
const rel = path.relative(ROOT, file).replace(/\\/g, '/')
const line = '─'.repeat(52)

console.log(`
${line}
  已创建  ${rel}
${line}
  标题    ${title}
  网址    /blog/${finalSlug}
  标签    ${opts.tags.length ? opts.tags.join(' / ') : '(未设置)'}
  日期    ${date}
  状态    ${opts.draft ? '草稿 (draft: true)' : '正常发布 (draft: false)'}
${line}
`)

if (slugIsPlaceholder) {
  console.log(`注意：标题是纯中文，网址先用占位名 "${finalSlug}"。
      想换成好看的网址，把文件改名即可（文件名就是网址）：
      mv content/posts/${finalSlug}.md content/posts/my-post.md
`)
}

console.log(`下一步
  1. 打开 ${rel} 直接写正文
  2. 另开一个终端跑  bun run dev  （保存即刷新，浏览器实时生效）
  3. 写完把 frontmatter 里的 description 补上（列表页和 SEO 会用到）
  4. 发布上线：见 README 的「日常流程」一节
`)
