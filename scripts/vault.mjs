#!/usr/bin/env node
/**
 * Vault CLI —— 把私密笔记加密进仓库。
 *
 * ── 工作流（关键：明文目录永不进 git）────────────────────────────────
 *
 *   vault-src/            ← 明文 .md，**已被 .gitignore 忽略**，只存在你本机
 *   content/vault/*.json  ← 密文，**提交进仓库**，别人 clone 也只看到乱码
 *
 *   vault new <name>      在 vault-src/ 建一篇新笔记（明文，直接编辑）
 *   vault lock            把 vault-src/ 下所有明文加密到 content/vault/
 *   vault unlock          把 content/vault/ 下所有密文解密回 vault-src/（换机器时用）
 *   vault list            列出密文条目（标题/日期/大小）
 *   vault status          检查明文与密文是否同步（有没有忘了 lock）
 *
 * ── 密码从哪来 ─────────────────────────────────────────────────────
 *
 *   优先级：--password 参数 > VAULT_PASSWORD 环境变量 > 交互式隐藏输入
 *   推荐用环境变量或交互输入，**别把密码写进命令行参数**（会留在 shell 历史里）。
 *
 * 用法示例：
 *   node scripts/vault.mjs new 我的笔记
 *   node scripts/vault.mjs lock
 *   node scripts/vault.mjs list
 *   node scripts/vault.mjs unlock
 */
import { createInterface } from 'node:readline'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { encryptText, decryptText, VaultError } from '../shared/vault-crypto.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const SRC_DIR = join(root, 'vault-src') // 明文（gitignored）
const ENC_DIR = join(root, 'content', 'vault') // 密文（提交）

/**
 * 密文扩展名用 `.json` 而不是 `.enc`。
 *
 * ⚠️ 这是个踩过的坑：最初用 `.enc`，构建时 @nuxt/content 直接报
 *   `Error: .enc files are not supported` 并把文件忽略掉 —— 它只认
 *   `.md/.yml/.yaml/.json/.csv/...` 这几种。我们的密文本体就是一个 JSON
 *   对象，所以用 `.json` 既能让 Content 正常索引，语义上也说得通。
 */
const ENC_EXT = '.json'

const args = process.argv.slice(2)
const cmd = args[0]
const rest = args.filter((a) => !a.startsWith('--'))
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...v] = a.replace(/^--/, '').split('=')
      return [k, v.length ? v.join('=') : true]
    }),
)

/* ────────────────────────── 辅助 ────────────────────────── */

function ensureDirs() {
  for (const d of [SRC_DIR, ENC_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true })
}

/** 交互式读密码（隐藏输入） */
function promptPassword(question = '密码: ') {
  return new Promise((resolveP) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    // 覆盖 _writeToOutput 实现掩码
    const orig = rl._writeToOutput?.bind(rl)
    rl._writeToOutput = (s) => {
      if (s.includes(question)) orig?.(s)
      else orig?.('*')
    }
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolveP(answer)
    })
  })
}

/** 取密码：参数 > 环境变量 > 交互输入 */
async function getPassword(confirm = false) {
  if (typeof flags.password === 'string') return flags.password
  if (process.env.VAULT_PASSWORD) return process.env.VAULT_PASSWORD
  const pw = await promptPassword()
  if (!pw) {
    console.error('❌ 密码不能为空')
    process.exit(1)
  }
  if (confirm) {
    const again = await promptPassword('再输一次: ')
    if (pw !== again) {
      console.error('❌ 两次输入不一致')
      process.exit(1)
    }
  }
  return pw
}

/** 从明文 markdown 的 frontmatter 里抠出 meta（标题/日期/标签） */
function parseFrontmatter(text, fallbackTitle) {
  const meta = { title: fallbackTitle, date: '', tags: [] }
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return meta
  const yaml = m[1]
  const t = yaml.match(/^title:\s*(.+)$/m)
  if (t) meta.title = t[1].trim().replace(/^["']|["']$/g, '')
  const d = yaml.match(/^date:\s*(.+)$/m)
  if (d) meta.date = d[1].trim().replace(/^["']|["']$/g, '')
  // tags 支持行内 [a, b] 与块状 - a
  const inline = yaml.match(/^tags:\s*\[(.*)\]$/m)
  if (inline) {
    meta.tags = inline[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  } else {
    const block = yaml.match(/^tags:\s*\r?\n((?:\s*-\s*.+\r?\n?)+)/m)
    if (block) {
      meta.tags = block[1]
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    }
  }
  return meta
}

/**
 * 明文文件名 → 密文文件名（保持 ASCII 安全）。
 *
 * ⚠️ 关键坑：纯中文名（如「测试笔记.md」）slug 化后是空串，
 *    如果直接回退成固定名，多篇笔记会**全部撞名互相覆盖**。
 *    所以这里用「文件名哈希」兜底，保证同一个明文名永远映射到同一个
 *    密文名，且不同明文名几乎不可能碰撞。
 */
function toEncName(base) {
  const stem = base.replace(/\.md$/i, '')
  const slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug) return `${slug}${ENC_EXT}`
  // 纯非 ASCII 名（中文/日文等）：用 8 位哈希兜底
  return `note-${shortHash(stem)}${ENC_EXT}`
}

/** FNV-1a 32 位哈希 → 8 位十六进制（只用于生成文件名，非加密用途） */
function shortHash(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const fmtSize = (n) => (n < 1024 ? `${n}B` : `${(n / 1024).toFixed(1)}KB`)

/* ────────────────────────── 命令 ────────────────────────── */

async function cmdNew() {
  ensureDirs()
  const name = rest.slice(1).join(' ').trim()
  if (!name) {
    console.error('用法: node scripts/vault.mjs new <笔记名>')
    process.exit(1)
  }
  const file = join(SRC_DIR, `${name}.md`)
  if (existsSync(file)) {
    console.error(`❌ 已存在：vault-src/${name}.md`)
    process.exit(1)
  }
  const today = new Date().toISOString().slice(0, 10)
  writeFileSync(
    file,
    [
      '---',
      `title: ${name}`,
      `date: ${today}`,
      'tags:',
      '  - 私密',
      '---',
      '',
      '在这里写你的私密笔记。',
      '',
      '> 写完执行 `node scripts/vault.mjs lock` 加密进仓库。',
      '> 这个文件在 vault-src/ 下，已被 .gitignore 忽略，不会提交。',
      '',
    ].join('\n'),
    'utf8',
  )
  console.log(`✅ 已创建明文笔记：vault-src/${name}.md`)
  console.log('   ✏️  编辑它，然后运行：node scripts/vault.mjs lock')
}

async function cmdLock() {
  ensureDirs()
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.md'))
  if (!files.length) {
    console.log('ℹ️  vault-src/ 下没有 .md 文件，无需加密。')
    console.log('   先建一篇：node scripts/vault.mjs new <笔记名>')
    return
  }

  const password = await getPassword(false)
  console.log(`\n🔒 开始加密 ${files.length} 个文件…\n`)

  let n = 0
  for (const f of files) {
    const plain = readFileSync(join(SRC_DIR, f), 'utf8')
    const meta = parseFrontmatter(plain, f.replace(/\.md$/, ''))
    // 记住原始明文文件名，unlock 时才能精确还原（而不是靠标题猜）
    meta.source = f
    // ⚠️ 这里传 { meta }，encryptText 内部会把 title/date/tags/source
    //    摊平到密文顶层（不能嵌套，否则 Content 的 data 集合会丢掉它）
    const entry = await encryptText(plain, password, { meta })
    writeFileSync(join(ENC_DIR, toEncName(f)), JSON.stringify(entry, null, 2) + '\n', 'utf8')
    n++
    console.log(
      `  ${f}  →  content/vault/${toEncName(f)}   [${fmtSize(plain.length)} → ${fmtSize(JSON.stringify(entry).length)}]`,
    )
  }
  console.log(`\n✅ 已加密 ${n} 个文件到 content/vault/`)
  console.log('   这些密文可以安全地 git add / commit。')
}

async function cmdUnlock() {
  ensureDirs()
  const files = readdirSync(ENC_DIR).filter((f) => f.endsWith(ENC_EXT))
  if (!files.length) {
    console.log(`ℹ️  content/vault/ 下没有密文文件。`)
    return
  }

  const password = await getPassword(false)
  console.log(`\n🔓 开始解密 ${files.length} 个文件…\n`)

  let n = 0
  let bad = 0
  let skipped = 0
  for (const f of files) {
    const entry = JSON.parse(readFileSync(join(ENC_DIR, f), 'utf8'))
    try {
      const { text, meta } = await decryptText(entry, password)
      // 优先用加密时记下的原始文件名，精确还原；旧文件没有就退回标题
      const raw = meta?.source || meta?.title || f.replace(new RegExp(`\\${ENC_EXT}$`), '')
      const outName = `${raw.replace(/[/\\:*?"<>|]/g, '_').replace(/\.md$/i, '')}.md`
      const target = join(SRC_DIR, outName)
      if (existsSync(target) && readFileSync(target, 'utf8') === text) {
        skipped++
        console.log(`  ${f}  →  vault-src/${outName}   (已存在且一致，跳过)`)
        continue
      }
      writeFileSync(target, text, 'utf8')
      n++
      console.log(`  ${f}  →  vault-src/${outName}`)
    } catch (err) {
      bad++
      const msg = err instanceof VaultError ? err.message : String(err?.message ?? err)
      console.log(`  ${f}  ❌ ${msg}`)
    }
  }
  console.log(`\n✅ 解密 ${n} 个${skipped ? `，跳过 ${skipped} 个` : ''}${bad ? `，失败 ${bad} 个` : ''}`)
  if (bad) console.log('   失败的条目密码不对，或文件损坏。')
  if (n) console.log('   ⚠️  解密出的明文在 vault-src/（已被 .gitignore 忽略），改完记得重新 lock。')
}

function cmdList() {
  ensureDirs()
  const files = readdirSync(ENC_DIR).filter((f) => f.endsWith(ENC_EXT)).sort()
  if (!files.length) {
    console.log('ℹ️  content/vault/ 下没有密文文件。')
    return
  }
  console.log(`\ncontent/vault/ 共 ${files.length} 个加密条目：\n`)
  for (const f of files) {
    const raw = readFileSync(join(ENC_DIR, f), 'utf8')
    let entry = {}
    try {
      entry = JSON.parse(raw)
    } catch {
      console.log(`  ${f}  ⚠️ JSON 解析失败`)
      continue
    }
    // 兼容两种布局：新的摊平格式（顶层）与早期版本的 meta 嵌套格式
    const title = entry.title || entry.meta?.title || '(无标题)'
    const date = entry.date || entry.meta?.date || '—'
    const tagList = entry.tags ?? entry.meta?.tags
    const tags = Array.isArray(tagList) && tagList.length ? `  #${tagList.join(' #')}` : ''
    console.log(`  ${f}`)
    console.log(`    ${title}   ${date}   [${fmtSize(raw.length)}]${tags}`)
  }
  console.log('\n注：以上标题/日期是**明文**存储的（用于列表展示）。')
  console.log('    若连标题也要保密，改 scripts/vault.mjs 让 title 也纳入加密范围。')
}

/** 对比明文与密文是否同步（有没有忘了 lock） */
function cmdStatus() {
  ensureDirs()
  const srcFiles = readdirSync(SRC_DIR).filter((f) => f.endsWith('.md')).sort()
  const encFiles = readdirSync(ENC_DIR).filter((f) => f.endsWith(ENC_EXT)).sort()

  console.log(`\n明文 vault-src/：${srcFiles.length} 个`)
  for (const f of srcFiles) {
    const enc = toEncName(f)
    const has = encFiles.includes(enc)
    const t = has ? statSync(join(ENC_DIR, enc)).mtimeMs : 0
    const s = statSync(join(SRC_DIR, f)).mtimeMs
    const stale = has && s > t + 1000 // 明文比密文新 → 忘了 lock
    const mark = !has ? '❌ 未加密' : stale ? '⚠️ 明文更新了，需要重新 lock' : '✅ 已同步'
    console.log(`  ${mark}  ${f}${has ? `  →  ${enc}` : ''}`)
  }

  const orphan = encFiles.filter((e) => !srcFiles.some((f) => toEncName(f) === e))
  if (orphan.length) {
    console.log(`\n密文 {enc} 在 vault-src/ 里找不到对应明文（可能是别的机器加的）：`.replace('{enc}', `content/vault/（${orphan.length} 个）`))
    for (const o of orphan) console.log(`  ${o}`)
    console.log('  想编辑它们先运行：node scripts/vault.mjs unlock')
  }
  console.log()
}

function cmdHelp() {
  console.log(`
Vault —— 私密笔记加密

  node scripts/vault.mjs new <笔记名>   新建明文笔记（vault-src/，不进 git）
  node scripts/vault.mjs lock           加密 vault-src/ 全部明文 → content/vault/*.json
  node scripts/vault.mjs unlock         解密 content/vault/*.json → vault-src/（换机器时用）
  node scripts/vault.mjs list           列出加密条目
  node scripts/vault.mjs status         检查明文/密文是否同步

密码来源：--password=xxx  >  环境变量 VAULT_PASSWORD  >  交互式输入
推荐：export VAULT_PASSWORD='你的长密码' 或直接交互输入（不留 shell 历史）
`)
}

/* ────────────────────────── 入口 ────────────────────────── */

const COMMANDS = {
  new: cmdNew,
  lock: cmdLock,
  unlock: cmdUnlock,
  list: cmdList,
  status: cmdStatus,
  help: cmdHelp,
}

const fn = COMMANDS[cmd]
if (!fn) {
  if (cmd && cmd !== '--help') console.error(`❌ 未知命令：${cmd}\n`)
  cmdHelp()
  process.exit(cmd ? 1 : 0)
}
await fn()
