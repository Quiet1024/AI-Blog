/**
 * Vault 加密核心 —— 浏览器与 Node 共用（WebCrypto / SubtleCrypto）。
 *
 * ── 设计目标 ──────────────────────────────────────────────────────
 *
 * 让「私密笔记」以**密文**形式进仓库：别人 clone 仓库 / 浏览源码，
 * 看到的只是一堆 Base64 乱码，没有密码什么都读不出。
 *
 * ── 算法与参数（都选了保守的、浏览器原生支持的）──────────────────
 *
 *   密钥派生：PBKDF2-HMAC-SHA256，210_000 次迭代（OWASP 2023 建议 ≥600k 对
 *             SHA256，这里取 210k 是「浏览器端单次解锁 ≤1s」与强度的折中，
 *             想更硬把 ITERATIONS 调大即可，旧文件仍能解，因为迭代次数写在文件里）
 *   加密：    AES-256-GCM（带认证，能检出篡改）
 *   随机数：  16 字节 salt + 12 字节 iv，每次加密都重新生成
 *
 * ── 密文文件格式（.enc，UTF-8 文本）────────────────────────────────
 *
 * 存成「带元信息的 JSON 文本」而不是裸二进制，好处是：
 *   · 可以直接 commit 进 git，diff 友好（虽然内容仍是密文）；
 *   · 元信息（标题、日期）可以留**明文**用于列表展示，正文才加密。
 *
 *   {
 *     "v": 1,                       // 格式版本
 *     "kdf": "PBKDF2-SHA256",
 *     "iter": 210000,
 *     "salt": "<base64>",
 *     "iv":   "<base64>",
 *     "data": "<base64 密文>",
 *     // ── 以下是明文元信息（用于解锁前展示列表）──
 *     "title": "...",
 *     "date":  "2026-10-03",
 *     "tags":  [...],
 *     "source": "原始明文文件名.md"
 *   }
 *
 * ⚠️ 为什么元信息**摊平在顶层**而不是收进一个 `meta: {...}` 嵌套对象：
 *    这是踩坑换来的。@nuxt/content 的 `type: 'data'` 集合在处理 JSON 时，
 *    嵌套对象如果没在 schema 里显式声明，会被**整个丢弃** ——
 *    实测 `<script id="__NUXT_DATA__">` 里拿到的 `meta` 是个 `{}`，
 *    于是解锁前的列表完全没有标题可显示。摊平到顶层后一切正常。
 *
 * ⚠️ 安全边界（务必让使用者知道）
 *
 *   · 这是**客户端加密**：密文与解密逻辑都在公开站点上，能下载就能离线爆破。
 *     → 真正的安全强度 = 密码强度。请用长密码（建议 ≥16 位随机串）。
 *   · 标题 / 日期 / 标签是明文的，会被任何拿到仓库的人看到。
 *     若连标题都要保密，别把它写进这些字段（或改 encryptText 的 meta 处理）。
 *   · 这不是「服务端鉴权」，没有任何频率限制 / 账号体系。
 */

/** 当前格式版本 */
export const VAULT_VERSION = 1

/** PBKDF2 迭代次数。调大更安全但解锁更慢；旧文件靠文件里的 iter 字段兼容。 */
export const DEFAULT_ITERATIONS = 210_000

const KDF_NAME = 'PBKDF2-SHA256'
const SALT_BYTES = 16
const IV_BYTES = 12
const KEY_BITS = 256

/* ────────────────────────── Base64 工具 ────────────────────────── */

/** Uint8Array → base64（浏览器与 Node 共用） */
export function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

/** base64 → Uint8Array */
export function base64ToBytes(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'))
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/* ────────────────────────── WebCrypto 取用 ────────────────────────── */

/**
 * 拿到 SubtleCrypto。
 * 浏览器：globalThis.crypto.subtle（要求 HTTPS 或 localhost —— 正好是本站的两种场景）
 * Node 22：globalThis.crypto.subtle（已内置，无需 node:crypto.webcrypto 兼容层）
 */
function getSubtle() {
  const c = globalThis.crypto
  if (!c?.subtle) {
    throw new Error(
      'WebCrypto 不可用。浏览器端请确认在 HTTPS 或 localhost 下访问（http 明文域不安全，浏览器会禁用 subtle）。',
    )
  }
  return c.subtle
}

/** 生成密码学安全随机字节 */
function randomBytes(n) {
  const c = globalThis.crypto
  if (!c?.getRandomValues) throw new Error('crypto.getRandomValues 不可用')
  const out = new Uint8Array(n)
  c.getRandomValues(out)
  return out
}

/* ────────────────────────── 密钥派生 ────────────────────────── */

/**
 * 用密码 + salt 派生出 AES-GCM 用的 CryptoKey。
 *
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {number} iterations
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(password, salt, iterations = DEFAULT_ITERATIONS) {
  const subtle = getSubtle()
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false, // 不可导出：派生出的密钥拿不出去，降低误泄漏面
    ['encrypt', 'decrypt'],
  )
}

/* ────────────────────────── 加密 ────────────────────────── */

/**
 * 加密一段文本，返回密文文件对象（可直接 JSON.stringify 落盘）。
 *
 * @param {string} plaintext  要加密的正文
 * @param {string} password
 * @param {object} [options]
 * @param {object} [options.meta]         明文元信息（标题/日期/标签），用于列表展示
 * @param {number} [options.iterations]
 * @returns {Promise<object>} 密文文件对象
 */
export async function encryptText(plaintext, password, options = {}) {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const key = await deriveKey(password, salt, iterations)
  const subtle = getSubtle()

  const cipherBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )

  // ⚠️ meta 摊平到顶层，不要收成嵌套对象 —— 原因见文件头注释
  const meta = options.meta ?? {}
  return {
    v: VAULT_VERSION,
    kdf: KDF_NAME,
    iter: iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(cipherBuf)),
    // 以下为明文元信息
    title: String(meta.title ?? '未命名'),
    date: String(meta.date ?? ''),
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
    source: String(meta.source ?? ''),
  }
}

/* ────────────────────────── 解密 ────────────────────────── */

/**
 * 解密一个密文文件对象。
 *
 * @param {object} entry   密文文件对象（encryptText 的产物，或 JSON.parse 的结果）
 * @param {string} password
 * @returns {Promise<{ text: string, meta: object }>}
 * @throws {VaultError} 密码错误 / 文件损坏 / 格式不支持
 */
export async function decryptText(entry, password) {
  if (!entry || typeof entry !== 'object') {
    throw new VaultError('INVALID_FORMAT', '密文条目格式不正确（期望一个对象）')
  }
  if (entry.v !== VAULT_VERSION) {
    throw new VaultError(
      'UNSUPPORTED_VERSION',
      `不支持的密文版本：${entry.v}（本程序支持 v${VAULT_VERSION}）`,
    )
  }
  if (entry.kdf !== KDF_NAME) {
    throw new VaultError('UNSUPPORTED_KDF', `不支持的密钥派生算法：${entry.kdf}`)
  }
  if (!entry.salt || !entry.iv || !entry.data) {
    throw new VaultError('INVALID_FORMAT', '密文条目缺少 salt / iv / data 字段')
  }

  const iterations = Number(entry.iter) || DEFAULT_ITERATIONS
  const salt = base64ToBytes(entry.salt)
  const iv = base64ToBytes(entry.iv)
  const data = base64ToBytes(entry.data)

  let key
  try {
    key = await deriveKey(password, salt, iterations)
  } catch (err) {
    throw new VaultError('CRYPTO_UNAVAILABLE', String(err?.message ?? err))
  }

  const subtle = getSubtle()
  let plainBuf
  try {
    plainBuf = await subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  } catch {
    // AES-GCM 认证失败只有一种常见原因：密钥（即密码）不对。
    // 也可能是密文被改过 —— 但对外统一报「密码错误或文件损坏」最不容易误导。
    throw new VaultError('BAD_PASSWORD', '密码错误，或文件已损坏')
  }

  return {
    text: new TextDecoder().decode(plainBuf),
    // 兼容两种布局：新的摊平格式，与早期版本的 meta 嵌套格式
    meta: {
      title: entry.title ?? entry.meta?.title ?? '',
      date: entry.date ?? entry.meta?.date ?? '',
      tags: entry.tags ?? entry.meta?.tags ?? [],
      source: entry.source ?? entry.meta?.source ?? '',
    },
  }
}

/* ────────────────────────── 错误类型 ────────────────────────── */

/** 带错误码的异常，方便 UI 区分「密码错」和「环境不支持」 */
export class VaultError extends Error {
  /**
   * @param {'BAD_PASSWORD'|'INVALID_FORMAT'|'UNSUPPORTED_VERSION'|'UNSUPPORTED_KDF'|'CRYPTO_UNAVAILABLE'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'VaultError'
    this.code = code
  }
}
