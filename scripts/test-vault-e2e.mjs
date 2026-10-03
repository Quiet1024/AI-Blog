/**
 * vault 端到端验证 —— 需要 dev server 正在运行。
 *
 * 用法：
 *   1. 另开一个终端跑 bun run dev（或 nuxt dev）
 *   2. VAULT_TEST_PORT=3001 node scripts/test-vault-e2e.mjs
 *
 * 它做三件事，全部走与浏览器相同的代码路径：
 *   1. 抓 /vault 页面的 SSR payload（= 浏览器实际拿到的数据）
 *   2. 用密码解密每条，断言正文与 vault-src/ 下的源文件逐字节一致
 *   3. 断言错误密码解不开
 *
 * 原始说明：
 * 端到端验证：把 /vault 页面 payload 里取到的密文，
 * 用与前端完全相同的代码路径解密出来。
 *
 * 模拟真实浏览器行为：
 *   1. 抓 SSR payload（就是浏览器拿到的数据）
 *   2. 用密码派生的密钥解密
 *   3. 断言正文与源文件一致
 */
import { decryptText, VaultError } from '../shared/vault-crypto.mjs'
import { readFileSync } from 'node:fs'

const PASSWORD = 'test-password-12345'

// ── 1. 取 payload（等价于浏览器 <script id="__NUXT_DATA__"> 的内容）──
const PORT = process.env.VAULT_TEST_PORT || 3001
const res = await fetch(`http://localhost:${PORT}/vault`)
const html = await res.text()
const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
const data = JSON.parse(m[1])

/** Nuxt payload 是扁平数组 + 索引引用，这里解析出对象 */
function resolve(idx, seen) {
  if (typeof idx !== 'number' || idx < 0) return idx
  const bag = seen || new Set()
  if (bag.has(idx)) return '[circular]'
  bag.add(idx)
  const v = data[idx]
  if (Array.isArray(v)) {
    // ["ShallowReactive", n] 这类标记，取后一个索引
    if (typeof v[0] === 'string' && v.length === 2) {
      bag.delete(idx)
      return resolve(v[1], bag)
    }
    return v.map((x) => resolve(x, new Set(bag)))
  }
  if (v && typeof v === 'object') {
    const out = {}
    for (const [k, val] of Object.entries(v)) out[k] = resolve(val, new Set(bag))
    return out
  }
  return v
}

const appData = resolve(1)
const entries = appData.data['vault:all']
console.log(`payload 里取到 ${entries.length} 个条目\n`)

// ── 2. 逐条解密 ──
let pass = 0
let fail = 0

for (const e of entries) {
  const label = `${e.stem}`
  try {
    const { text, meta } = await decryptText(e, PASSWORD)
    const srcName = meta.source
    const expected = readFileSync(`vault-src/${srcName}`, 'utf8')
    const same = text === expected
    console.log(`${same ? '✅' : '❌'} ${label}`)
    console.log(`     标题=${meta.title}  日期=${meta.date}  标签=[${meta.tags}]`)
    console.log(`     正文 ${text.length} 字符，与 vault-src/${srcName} ${same ? '逐字节一致' : '不一致！'}`)
    console.log(`     密文长度 ${e.data.length}，无法直接读出内容: ${!e.data.includes('笔记') ? '是' : '否 ⚠️'}`)
    same ? pass++ : fail++
  } catch (err) {
    fail++
    console.log(`❌ ${label} 解密失败：${err.message}`)
  }
}

// ── 3. 错误密码必须失败 ──
console.log('\n--- 错误密码验证 ---')
for (const e of entries) {
  try {
    await decryptText(e, 'wrong-password')
    console.log(`❌ ${e.stem} 用错误密码竟然解开了`)
    fail++
  } catch (err) {
    const ok = err instanceof VaultError && err.code === 'BAD_PASSWORD'
    ok ? pass++ : fail++
    console.log(`${ok ? '✅' : '❌'} ${e.stem} 错误密码被拒（${err.code || err.message}）`)
  }
}

console.log(`\n${'─'.repeat(50)}`)
console.log(fail === 0 ? `🎉 端到端全部通过：${pass} 项` : `❌ ${fail} 失败 / ${pass} 通过`)
process.exit(fail ? 1 : 0)
