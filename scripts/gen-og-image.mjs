/**
 * 生成默认社交分享图（public/og-default.png，1200x630）。
 * 用 sharp 渲染 SVG，无需联网、不依赖 satori。
 * 换站名/域名后重新执行：node scripts/gen-og-image.mjs
 */
import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const siteConfig = readFileSync(resolve(root, 'app/data/site.ts'), 'utf-8')
const pick = (key) => {
  const m = siteConfig.match(new RegExp(`${key}:\\s*'([^']*)'`))
  return m ? m[1] : ''
}

const name = pick('name')
const tagline = pick('tagline')
const url = pick('url').replace(/^https?:\/\//, '')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f766e"/>
      <stop offset="100%" stop-color="#5eead4"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#faf9f7"/>
  <circle cx="1080" cy="120" r="200" fill="url(#accent)" opacity="0.16"/>
  <circle cx="1140" cy="560" r="120" fill="#e0a548" opacity="0.14"/>
  <line x1="80" y1="150" x2="200" y2="150" stroke="#0f766e" stroke-width="4"/>
  <text x="80" y="220" font-family="Microsoft YaHei, Noto Sans SC, sans-serif"
        font-size="26" fill="#0f8773" letter-spacing="8">JOURNAL</text>
  <text x="80" y="360" font-family="Microsoft YaHei, Noto Sans SC, sans-serif"
        font-size="104" font-weight="700" fill="#1f1d1a">${name}</text>
  <text x="84" y="436" font-family="Microsoft YaHei, Noto Sans SC, sans-serif"
        font-size="34" fill="#4b473f">${tagline}</text>
  <line x1="80" y1="520" x2="1120" y2="520" stroke="#d3d1c7" stroke-width="1"/>
  <text x="80" y="568" font-family="Microsoft YaHei, Noto Sans SC, sans-serif"
        font-size="24" fill="#888780">${url}</text>
</svg>`

mkdirSync(resolve(root, 'public'), { recursive: true })
const out = resolve(root, 'public/og-default.png')
await sharp(Buffer.from(svg)).png().toFile(out)
console.log('written:', out)
