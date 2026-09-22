#!/usr/bin/env node
/**
 * 主题查看器
 *
 *   node scripts/preview-theme.mjs                   列出参考主题及其配置入口
 *   node scripts/preview-theme.mjs blog-v3           启动该主题（前台，端口 3100）
 *   node scripts/preview-theme.mjs blog-v3 3200      指定端口
 *   node scripts/preview-theme.mjs blog-v3 --skip-install
 *   node scripts/preview-theme.mjs all               后台并行启动全部主题（3101 起）
 *   node scripts/preview-theme.mjs stop              停掉 all 起的所有服务
 *
 * 参考主题默认放在项目**外面**：../reference-themes/（可用环境变量 THEMES_DIR 覆盖）。
 * 为什么不放项目内：Tailwind 4 会自动扫描项目里的源文件收集类名，
 * 几套完整主题躺在项目里会让构建时间从几分钟涨到二十分钟以上。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync, spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const themesDir = process.env.THEMES_DIR
  ? resolve(process.env.THEMES_DIR)
  : resolve(root, '..', 'reference-themes')
const pidFile = join(dirname(fileURLToPath(import.meta.url)), '.theme-pids.json')

/** 主题配置的常见落点，按重要性排序 */
const CONFIG_CANDIDATES = [
  'app/app.config.ts',
  'app.config.ts',
  'blog.config.ts',
  'tailwind.config.js',
  'tailwind.config.ts',
  'app/assets/css/main.css',
  'app/assets/css/tailwind.css',
  'assets/css/main.css',
  'nuxt.config.ts',
]

function listThemes() {
  if (!existsSync(themesDir)) return []
  return readdirSync(themesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
}

/** 从配置文件里抠出最值得看的几行 */
function peek(file, max = 6) {
  try {
    const lines = readFileSync(file, 'utf-8').split('\n')
    const hits = []
    for (const line of lines) {
      if (
        /colors\s*:|primary|neutral|theme\s*:|accent|--color|fontFamily|font-family|darkMode|extend\s*:/.test(
          line,
        )
      ) {
        hits.push(line.trim().slice(0, 100))
        if (hits.length >= max) break
      }
    }
    return hits
  } catch {
    return []
  }
}

function printCatalog() {
  const themes = listThemes()
  if (!themes.length) {
    console.log(`参考主题目录不存在或为空：${themesDir}`)
    console.log('拉几套下来（在项目外面）：')
    console.log(
      '  git clone --depth 1 https://github.com/bloggrify/bloggrify.git ../reference-themes/bloggrify',
    )
    return
  }
  console.log(`\n可用的参考主题（在 ${themesDir}，不在项目里、不参与构建）\n`)
  for (const name of themes) {
    const dir = join(themesDir, name)
    const installed = existsSync(join(dir, 'node_modules'))
    console.log(`■ ${name}${installed ? '（依赖已装）' : ''}`)
    const found = CONFIG_CANDIDATES.filter((f) => existsSync(join(dir, f)))
    if (!found.length) console.log('    （未找到常见配置文件，可能克隆不完整）')
    for (const f of found) {
      console.log(`    ${f}`)
      for (const line of peek(join(dir, f), f.includes('nuxt.config') ? 0 : 4)) {
        console.log(`        ${line}`)
      }
    }
    console.log('')
  }
  console.log('看某一套：node scripts/preview-theme.mjs <主题名> [端口]')
  console.log('全看一遍：node scripts/preview-theme.mjs all     （跑完用 stop 关掉）')
  console.log('改本项目配色：app/assets/css/main.css 的 [data-accent=…] 段，')
  console.log('              可选值登记在 app/data/accents.ts，页头右上角可直接切。\n')
}

function detectRunner(dir) {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(dir, 'package-lock.json'))) return 'npm'
  if (existsSync(join(dir, 'bun.lock')) || existsSync(join(dir, 'bun.lockb'))) return 'bun'
  return 'bun'
}

function installCmd(runner) {
  if (runner === 'pnpm') {
    return { cmd: 'pnpm', args: ['install', '--store-dir', resolve(root, '..', '.pnpm-store')] }
  }
  if (runner === 'npm') {
    return { cmd: 'npm', args: ['install', '--no-audit', '--no-fund'] }
  }
  return { cmd: 'bun', args: ['install'] }
}

function run(cmd, args, cwd) {
  console.log(`\n$ ${cmd} ${args.join(' ')}   (cwd: ${cwd})\n`)
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  return res.status ?? 0
}

/** 后台起服务，返回 pid */
function startDetached(dir, runner, port) {
  const env = { ...process.env, PORT: String(port) }
  const child = spawn(runner, ['run', 'dev', '--', '--port', String(port)], {
    cwd: dir,
    detached: true,
    stdio: 'ignore',
    shell: process.platform === 'win32',
    env,
  })
  child.unref()
  return child.pid
}

function stopAll() {
  if (!existsSync(pidFile)) {
    console.log('没有记录在案的服务（先跑 node scripts/preview-theme.mjs all）。')
    return
  }
  const records = JSON.parse(readFileSync(pidFile, 'utf-8'))
  for (const r of records) {
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(r.pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        process.kill(-r.pid, 'SIGTERM')
      }
      console.log(`已停止 ${r.name}（pid ${r.pid}, :${r.port}）`)
    } catch {
      console.log(`${r.name} 可能已经退出了`)
    }
  }
  rmSync(pidFile, { force: true })
}

const argv = process.argv.slice(2)
const name = argv.find((a) => !a.startsWith('-'))
const skipInstall = argv.includes('--skip-install')
const portFlag = argv.find((a) => /^\d+$/.test(a))

if (name === 'stop') {
  stopAll()
  process.exit(0)
}

if (!name) {
  printCatalog()
  process.exit(0)
}

if (name === 'all') {
  const themes = listThemes()
  if (!themes.length) {
    console.error(`参考主题目录为空：${themesDir}`)
    process.exit(1)
  }
  const records = []
  let port = 3101
  for (const t of themes) {
    const dir = join(themesDir, t)
    const runner = detectRunner(dir)
    if (!existsSync(join(dir, 'node_modules'))) {
      const { cmd, args } = installCmd(runner)
      const code = run(cmd, args, dir)
      if (code !== 0) {
        console.error(`跳过 ${t}：依赖装不上（可以先只读它的配置文件）\n`)
        continue
      }
    }
    const pid = startDetached(dir, runner, port)
    records.push({ name: t, port, pid })
    console.log(`▶ ${t}  →  http://localhost:${port}   (pid ${pid})`)
    port += 1
  }
  writeFileSync(pidFile, JSON.stringify(records, null, 2))
  console.log(`
已后台启动 ${records.length} 个服务，首次编译需要几十秒，稍等再打开：

${records.map((r) => `  ${r.name.padEnd(18)} http://localhost:${r.port}`).join('\n')}

全部关掉：node scripts/preview-theme.mjs stop
`);
  process.exit(0)
}

const dir = join(themesDir, name)
if (!existsSync(dir)) {
  console.error(`找不到主题「${name}」。可选：${listThemes().join(', ')}`)
  process.exit(1)
}

const runner = detectRunner(dir)
const port = portFlag || '3100'

console.log(`
主题：${name}
目录：${dir}
包管理器：${runner}（按锁文件推断，可用 --skip-install 跳过安装）
端口：${port}
`)

if (!skipInstall && !existsSync(join(dir, 'node_modules'))) {
  const { cmd, args } = installCmd(runner)
  const code = run(cmd, args, dir)
  if (code !== 0) {
    console.error('\n依赖安装失败。可以先看代码不跑它：直接读上面列出的配置文件。')
    process.exit(code)
  }
} else if (!skipInstall) {
  console.log('已存在 node_modules，跳过安装（要强制重装先删掉它）')
}

console.log(`\n启动中… 打开 http://localhost:${port} 查看该主题。Ctrl+C 结束。\n`)
process.exit(run(runner, ['run', 'dev', '--', '--port', String(port)], dir))
