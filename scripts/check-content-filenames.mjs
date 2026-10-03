/**
 * 校验 content/ 下的内容文件名必须是「URL 安全」的纯 ASCII。
 *
 * 为什么要这个脚本：
 *
 *   Nuxt Content 在 node_modules/@nuxt/content/dist/module.mjs 的 path-meta
 *   transformer 里这样算前台 URL：
 *
 *     const refineUrlPart = (name) => {
 *       name = name.split(/[/:]/).pop()        // 按「/」「:」切分，只留最后一段
 *       ...
 *     }
 *     const generatePath = (path) =>
 *       path.split('/').map((p) => slugify(refineUrlPart(p), { lower: true })).join('/')
 *
 *   slugify 默认**丢弃所有非 ASCII 字符**（中文全部消失），于是：
 *
 *     ai灵犀工作台.md                     → /blog/ai
 *     c盘爆了？？别慌-不用重装还能抢救.md   → /blog/c
 *
 *   最坏的情况不是「URL 变丑」，而是**两篇文章算出同一个 path**：
 *   它们抢同一个 URL 与数据库主键，后写入的覆盖先写入的 →
 *   「新建文章保存后封面变了，点进去却是上一篇的内容」（首尾错位）。
 *
 * 所以文件名一旦含中文/非 ASCII，就直接当成构建期错误拦下来。
 * 改文件名 = 改 URL，改完记得处理旧链接。
 *
 * 用法：node scripts/check-content-filenames.mjs
 * 退出码：0 = 全部合规；1 = 有不合规文件名
 */
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve, sep } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const contentDir = resolve(root, 'content')

/** 允许的扩展名（只检查会被 Content 收录成 URL 的文件） */
const EXT = new Set(['.md', '.yml', '.yaml'])

/** URL 安全：只允许小写字母、数字、连字符、下划线、点 */
const SAFE = /^[a-z0-9._-]+$/

/** 收集 content/ 下所有文件（相对 root 的路径） */
function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const files = walk(contentDir)
const bad = []
const ok = []

for (const full of files) {
  const rel = relative(root, full).split(sep).join('/')
  const base = rel.split('/').pop()
  const dot = base.lastIndexOf('.')
  const ext = dot >= 0 ? base.slice(dot).toLowerCase() : ''
  if (!EXT.has(ext)) continue

  const stem = dot >= 0 ? base.slice(0, dot) : base
  // 逐段检查目录名也一并管住（目录会进 path）
  const segments = rel.replace(/^content\//, '').split('/')
  const offenders = segments.filter((s) => !SAFE.test(s.split('.')[0] || s))

  if (offenders.length) bad.push({ rel, offenders })
  else ok.push(rel)
}

console.log(`检查目录：${relative(root, contentDir)}`)
console.log(`共 ${ok.length + bad.length} 个内容文件\n`)

if (!bad.length) {
  console.log('全部文件名都是 URL 安全的纯 ASCII。')
  process.exit(0)
}

console.error('发现非 ASCII / 非 URL 安全的文件名：\n')
for (const { rel, offenders } of bad) {
  console.error(`  ${rel}`)
  console.error(`    问题片段: ${offenders.join(', ')}`)
}
console.error(`
为什么必须改：Nuxt Content 用 slugify 生成 path，会丢掉全部中文。
文件名含中文时 path 会塌缩（ai灵犀工作台.md → /blog/ai），
两篇撞车就会互相覆盖，表现为「点进去是上一篇的内容」。

改法：换成英文短横线 slug，例如
  ai灵犀工作台.md        → ai-lingxi-workbench.md
  c盘爆了？？别慌….md     → c-drive-full-rescue.md
注意：改文件名 = 改 URL，旧链接会 404，需要自己决定是否加跳转。
`)
process.exit(1)
