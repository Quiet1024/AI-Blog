/**
 * 加密专区（vault）的客户端逻辑。
 *
 * ── 数据流 ────────────────────────────────────────────────────────────
 *
 *   content/vault/*.enc（密文，构建期被索引）
 *        ↓ queryCollection('vault')  ← 拿到的正文仍是密文
 *   /vault 页面输入密码
 *        ↓ decryptText()  ← shared/vault-crypto.mjs，浏览器 SubtleCrypto
 *   渲染明文正文
 *
 * ── 解锁模型：「一次解锁整个专区」────────────────────────────────────
 *
 *   密码只输一次。做法是把**派生出的密钥**（CryptoKey 对象，不是密码原文）
 *   放进一个模块级变量缓存，同一会话内切条目不用反复输入。
 *
 *   为什么不存 sessionStorage：CryptoKey 是不可导出（extractable: false）
 *   的对象，根本没法序列化。所以缓存只活在内存里 —— 关掉标签页/刷新即失效，
 *   这也正好符合「一次解锁本次访问」的安全预期。
 *
 *   想改成「刷新后仍解锁」需要把密码原文或原始密钥存 sessionStorage，
 *   那会扩大暴露面，故不做。
 *
 * ── 安全边界（同 vault-crypto.mjs，再次强调）────────────────────────
 *
 *   密文与解密代码都在公开站点上 → 可离线爆破 → 安全强度 = 密码强度。
 */
import type { Ref } from 'vue'
// Nuxt 4 内置别名：#shared/* → 项目根 shared/（见 .nuxt/tsconfig.json）
import { decryptText, deriveKey, VaultError } from '#shared/vault-crypto.mjs'

/** 索引里的密文条目（与 content.config.ts 的 vault schema 对应） */
export interface VaultEntry {
  id: string
  /** 以下元信息是明文，解锁前就能看到 */
  title: string
  date: string
  tags: string[]
  /** 原始明文文件名，供 unlock 精确还原 */
  source: string
  v: number
  kdf: string
  iter: number
  salt: string
  iv: string
  data: string
}

/** 解锁后的笔记 */
export interface VaultNote extends VaultEntry {
  /** 解密出的 Markdown 正文 */
  text: string
}

/* ────────────────────── 会话级解锁状态 ────────────────────── */

/**
 * 缓存的派生密钥。null = 未解锁。
 *
 * 之所以能跨条目复用：同一批 .enc 是用同一个密码加密的，
 * 而每个文件有各自的 salt —— 严格来说每个文件派生的密钥并不相同，
 * 所以这里缓存的是「密码派生的中间态」。
 * 为简化实现，我们改为缓存**密码原文**在内存里（不落盘、不入 sessionStorage），
 * 每个条目仍按自己的 salt 独立派生密钥。
 */
let sessionPassword: string | null = null

export function isUnlocked() {
  return sessionPassword !== null
}

/** 锁定：清掉内存里的密码 */
export function lockVault() {
  sessionPassword = null
}

/**
 * 尝试用密码解锁专区。
 * 会拿**第一篇**条目做验证 —— 成功即认为密码正确，之后所有条目共用。
 *
 * @returns 解锁成功返回 true，密码错误返回 false
 */
export async function unlockVault(entries: VaultEntry[], password: string): Promise<boolean> {
  if (!entries.length) return false
  try {
    await decryptText(entries[0], password)
    sessionPassword = password
    return true
  } catch (err) {
    if (err instanceof VaultError && err.code === 'BAD_PASSWORD') return false
    throw err
  }
}

/**
 * 解密单篇笔记。
 * @throws {Error} 未解锁时抛错；密码失效时抛 VaultError
 */
export async function decryptNote(entry: VaultEntry): Promise<string> {
  if (!sessionPassword) {
    throw new Error('专区尚未解锁')
  }
  try {
    const { text } = await decryptText(entry, sessionPassword)
    return text
  } catch (err) {
    if (err instanceof VaultError && err.code === 'BAD_PASSWORD') {
      // 密码在这个条目上失效了（理论上不该发生）→ 清掉缓存，要求重新解锁
      sessionPassword = null
    }
    throw err
  }
}

/* ────────────────────── 数据查询 ────────────────────── */

/** 拉取全部加密条目（按 date 倒序，无日期排最后） */
export async function fetchVaultEntries(): Promise<VaultEntry[]> {
  const { data } = await useAsyncData('vault:all', () =>
    queryCollection('vault' as never).all(),
  )
  const list = (data.value || []) as unknown as VaultEntry[]
  return list
    .map((e) => ({
      ...e,
      title: e.title || '未命名',
      date: e.date || '',
      tags: Array.isArray(e.tags) ? e.tags : [],
      source: e.source || '',
    }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

/** 条目里出现过的全部标签（用于筛选） */
export function collectVaultTags(entries: VaultEntry[]) {
  const map = new Map<string, number>()
  for (const e of entries) for (const t of e.tags) map.set(t, (map.get(t) || 0) + 1)
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** 解锁状态的响应式包装，供组件在解锁/锁定时重新渲染 */
export function useVaultState() {
  const unlocked = useState<boolean>('vault:unlocked', () => false)
  return {
    unlocked: unlocked as Ref<boolean>,
    markUnlocked: () => {
      unlocked.value = true
    },
    markLocked: () => {
      lockVault()
      unlocked.value = false
    },
  }
}

export { deriveKey }
