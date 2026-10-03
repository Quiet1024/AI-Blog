/**
 * vault-crypto 的端到端自测：
 *   1. 加密 → 解密，正文必须逐字节一致（含中文、emoji、换行）。
 *   2. 错误密码必须解不开（报 BAD_PASSWORD）。
 *   3. 篡改密文必须被 AES-GCM 认证检出。
 *   4. 相同明文 + 相同密码两次加密，产物必须不同（salt/iv 随机）。
 *   5. 元信息明文保留、可读。
 *
 * 用法：node scripts/test-vault-crypto.mjs
 */
import {
  encryptText,
  decryptText,
  VaultError,
  DEFAULT_ITERATIONS,
} from '../shared/vault-crypto.mjs'

let pass = 0
let fail = 0
const ok = (name) => { pass++; console.log(`  ✅ ${name}`) }
const no = (name, extra) => { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`) }

const PASSWORD = 'correct horse battery staple 电池订书钉'

// 故意用刁钻内容：中文、emoji、CRLF、零宽字符、超长行
const PLAINTEXT = [
  '# 私密笔记',
  '',
  '这是一段只有我自己能看的笔记。',
  '第一行\n第二行\r\n第三行（CRLF）',
  'emoji: 🔐🛡️🐱',
  '零宽字符: \u200b\u200c',
  'a'.repeat(5000),
  '',
  '```ts',
  'const secret = "别告诉别人"',
  '```',
].join('\n')

console.log(`PBKDF2 迭代次数 = ${DEFAULT_ITERATIONS}`)

// ── 1. 往返 ──────────────────────────────────────────────
const t0 = Date.now()
const entry = await encryptText(PLAINTEXT, PASSWORD, {
  meta: { title: '私密笔记示例', date: '2026-10-03', tags: ['私密'] },
})
const encMs = Date.now() - t0

const t1 = Date.now()
const out = await decryptText(entry, PASSWORD)
const decMs = Date.now() - t1

console.log(`\n加密耗时 ${encMs}ms / 解密耗时 ${decMs}ms`)
console.log(`密文大小 ${entry.data.length} 字符（base64）`)

out.text === PLAINTEXT ? ok('明文往返逐字节一致') : no('往返不一致', `len ${out.text.length} vs ${PLAINTEXT.length}`)
out.meta?.title === '私密笔记示例' ? ok('meta 明文保留') : no('meta 丢失')

// ── 2. 结构 ──────────────────────────────────────────────
entry.v === 1 ? ok('版本字段 v=1') : no('版本字段错误')
entry.kdf === 'PBKDF2-SHA256' ? ok('kdf 字段正确') : no('kdf 字段错误')
entry.salt && entry.iv ? ok('salt / iv 已写入') : no('salt 或 iv 缺失')
JSON.parse(JSON.stringify(entry)).data === entry.data ? ok('可 JSON 往返（能落盘）') : no('JSON 往返失败')

// ── 3. 错误密码 ──────────────────────────────────────────
try {
  await decryptText(entry, PASSWORD + 'x')
  no('错误密码竟然解开了')
} catch (err) {
  err instanceof VaultError && err.code === 'BAD_PASSWORD'
    ? ok('错误密码被拒（BAD_PASSWORD）')
    : no('错误密码报错类型不对', err?.code ?? err?.message)
}

// ── 4. 篡改检出 ──────────────────────────────────────────
const tampered = JSON.parse(JSON.stringify(entry))
const buf = Buffer.from(tampered.data, 'base64')
buf[10] ^= 0xff // 翻转一个字节
tampered.data = buf.toString('base64')
try {
  await decryptText(tampered, PASSWORD)
  no('篡改密文竟然解开了（GCM 认证失效）')
} catch (err) {
  err instanceof VaultError && err.code === 'BAD_PASSWORD'
    ? ok('篡改密文被 GCM 认证检出')
    : no('篡改报错类型不对', err?.code ?? err?.message)
}

// ── 5. salt/iv 随机性 ────────────────────────────────────
const e2 = await encryptText(PLAINTEXT, PASSWORD)
e2.data !== entry.data ? ok('两次加密密文不同（salt/iv 随机）') : no('两次加密密文相同')
e2.salt !== entry.salt ? ok('两次 salt 不同') : no('salt 重复')
e2.iv !== entry.iv ? ok('两次 iv 不同') : no('iv 重复')

// ── 6. 版本/格式防御 ─────────────────────────────────────
for (const [bad, label] of [
  [{ ...entry, v: 99 }, '未来版本'],
  [{ ...entry, kdf: 'MD5' }, '未知 kdf'],
  [{ ...entry, salt: '' }, '缺 salt'],
]) {
  try {
    await decryptText(bad, PASSWORD)
    no(`${label} 未被拒绝`)
  } catch (err) {
    err instanceof VaultError ? ok(`${label} 被拒绝（${err.code}）`) : no(`${label} 报错类型不对`)
  }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
