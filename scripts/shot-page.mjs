#!/usr/bin/env node
/**
 * 页面视觉体检 —— 截图 + 几何/对比度探针。
 *
 *   node scripts/shot-page.mjs /projects
 *   node scripts/shot-page.mjs /projects --sel .pc --name projects
 *   node scripts/shot-page.mjs / --sel ".cv-light, .cv-term" --name covers --dpr 2
 *   node scripts/shot-page.mjs /projects --zoom bl --zoom-sel .pc   # 放大看某个元素的左下角
 *
 * ⚠️ 长文章别用整页截图。一篇 7000px 高的文章整页出图是 2.5MB 上下，
 * 缩放之后又什么都看不清 —— 那是纯浪费（4 张就 10MB）。看文章用：
 *   --viewport            只截当前视口（1280x800@2x，够看清版式）
 *   --viewport --scroll N 先滚到第 N px 再截某一屏
 * 只有首页、作品页这种 2700px 以内的短页面才适合整页截。
 *
 * 做三件事：
 *   1. 同一条 URL 分别在 light / dark 两种配色方案下整页截图，落到 docs/ ；
 *   2. 对 --sel 命中的每个元素，量出盒子尺寸、圆角、底色、字号、**文字真实宽度**
 *      与可用宽度的差值（会不会被 overflow:hidden 裁掉）、以及文字与底色的对比度；
 *   3. --zoom 时再放大截一张局部图，用来肉眼确认接缝、圆角这类 1px 级别的问题。
 *
 * 为什么不用现成的截图 CLI：
 *   **`--headless=new` 会忽略命令行的 `prefers-color-scheme`**，必须在页面建立之后
 *   用 CDP 的 `Emulation.setEmulatedMedia` 注入，否则永远只能截到浅色。
 *   同理 `deviceScaleFactor` 也走 `Emulation.setDeviceMetricsOverride`。
 *
 * 为什么对比度/溢出要自己算而不是肉眼看截图：
 *   白字压在 accent-500 上的对比度是 2.98:1 还是 3.2:1，肉眼分辨不出来，
 *   而这正好卡在 WCAG 大字 3:1 的线上；文字溢出同理。
 *   另外 `.pc-name` 这种 flex 子项会被拉伸到整行，直接量 `getBoundingClientRect`
 *   拿到的永远是「盒子宽」而不是「文字宽」，量不出溢出 —— 必须用 Range。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
const flag = (name) => argv.includes(`--${name}`)

/** 第一个不属于任何 `--opt value` 的值 = 页面路径 */
const path_ = (() => {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { i++; continue } // 跳过 --opt 和它的值
    return argv[i]
  }
  return '/'
})()
const BASE = opt('base', 'http://127.0.0.1:3000')
const SEL = opt('sel', 'body')
const DPR = Number(opt('dpr', '2'))
const OUT = resolve(root, opt('out', 'docs'))
const NAME = opt('name', path_.replace(/[^\w]+/g, '') || 'page')
const URL_ = `${BASE}${path_}`
/** 放大局部：--zoom bl / br / tl / tr，配 --zoom-sel（默认同 --sel） */
const ZOOM = opt('zoom', '')
const ZOOM_SEL = opt('zoom-sel', SEL)
const ZOOM_SCALE = Number(opt('zoom-scale', '8'))
/**
 * 长文章整页截出来能到 7000+ px，缩放之后什么都看不清。
 * 加 --viewport 只截当前视口、--scroll 先滚到指定位置，
 * 就能一段一段地检查版式。
 */
const VIEWPORT_ONLY = flag('viewport')
const SCROLL = Number(opt('scroll', '0'))

const CHROME =
  process.env.CHROME_PATH ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe',
   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
   '/usr/bin/google-chrome',
   '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => existsSync(p))
if (!CHROME) {
  console.error('找不到 Chrome，请用 CHROME_PATH 指定可执行文件路径')
  process.exit(1)
}

/* ---------- 探针表达式（在页面里跑） ---------- */
const probeExpr = (sel) => `(() => {
  const lum = (rgb) => {
    const m = rgb.match(/\\d+/g);
    if (!m || m.length < 3) return null;
    const v = m.slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    if (l1 === null || l2 === null) return null;
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
  };
  const els = [...document.querySelectorAll(${JSON.stringify(sel)})];
  const meta = {
    title: document.title,
    dark: document.documentElement.classList.contains('dark'),
    matches: els.length,
  };
  /* 最近的**不透明**祖先背景 —— 文字自身底色通常是 transparent，
     拿它跟 transparent 求对比度没有意义。
     半透明层要**逐层 alpha 合成**：封面上的年份牌是 rgba(11,11,10,.34)
     压在 accent-500 上，直接拿 34% 黑去算会得出「白字对比度 6:1」这种假数据。 */
  const parseColor = (s) => {
    const m = s && s.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    if (p.length < 3 || p.some(isNaN)) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const effBgOf = (el) => {
    const layers = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break }
      n = n.parentElement;
    }
    /* 从最底层往上叠 */
    let base = { r: 255, g: 255, b: 255 };
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      base = {
        r: l.r * l.a + base.r * (1 - l.a),
        g: l.g * l.a + base.g * (1 - l.a),
        b: l.b * l.a + base.b * (1 - l.a),
      };
    }
    return 'rgb(' + [base.r, base.g, base.b].map((v) => Math.round(v)).join(', ') + ')';
  };
  const label = (el) =>
    el.id ? '#' + el.id
      : el.tagName.toLowerCase() + (el.classList[0] ? '.' + el.classList[0] : '');
  /* 半透明文字压在半透明底上时，真实颜色是混出来的；把 alpha 也算进去，
     否则「opacity: .88 的白字」会被当成纯白，报出来的对比度偏乐观 */
  const blend = (fg, bg, a) => {
    const f = fg.match(/\\d+/g).map(Number).slice(0, 3);
    const b = bg.match(/\\d+/g).map(Number).slice(0, 3);
    return 'rgb(' + f.map((v, i) => Math.round(v * a + b[i] * (1 - a))).join(', ') + ')';
  };
  const out = els.slice(0, 12).map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
    const innerW = r.width - padL - padR;

    /*
     * 收集「带文字的子孙」。直接量被选中的容器没用：容器的文字都在子元素里，
     * 而 flex 子项会被拉伸到整行，量出来永远等于可用宽度，看不出溢出。
     *
     * 跳过 aria-hidden 子树 —— 封面右上角那个巨大的序号水印是纯装饰
     * （字号比主标题还大），不跳的话它会顶掉真正要检查的标题。
     */
    const withText = [];
    const hasOwnText = (n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    const walk = (node) => {
      for (const ch of node.children) {
        if (ch.getAttribute('aria-hidden') === 'true') continue;
        if (hasOwnText(ch)) withText.push(ch);
        walk(ch);
      }
    };
    if (hasOwnText(el)) withText.push(el);
    walk(el);

    const texts = withText
      .map((e) => ({ e, fs: parseFloat(getComputedStyle(e).fontSize) || 0 }))
      .sort((a, b) => b.fs - a.fs)
      .slice(0, 3)
      .map(({ e }) => {
        const tcs = getComputedStyle(e);
        const bg = effBgOf(e);
        /* 累积不透明度：文字元素自身往上乘，乘到承载最终不透明底的那层为止 */
        let a = 1;
        for (let n = e; n && n !== document.documentElement; n = n.parentElement) {
          a *= parseFloat(getComputedStyle(n).opacity);
          const c = parseColor(getComputedStyle(n).backgroundColor);
          if (c && c.a >= 1) break;
        }
        const rgba = parseColor(tcs.color);
        if (rgba) a *= rgba.a;
        const rg = document.createRange();
        rg.selectNodeContents(e);
        const rects = [...rg.getClientRects()].filter((x) => x.width > 0);
        const textW = rects.length ? Math.round(Math.max(...rects.map((x) => x.width))) : null;
        const eff = a < 1 ? blend(tcs.color, bg, a) : tcs.color;
        return {
          sel: label(e),
          text: e.textContent.trim().slice(0, 40),
          fontSize: tcs.fontSize,
          textW,
          lines: rects.length || null,
          alpha: +a.toFixed(2),
          contrast: ratio(eff, bg),
          /* 主标题的溢出基准是容器的可用宽度；子元素自己的盒子宽度也可能更小 */
          overflowPx: textW === null ? null : Math.round(textW - (e === el ? innerW : r.width - padL - padR)),
        };
      });

    return {
      sel: label(el),
      box: [Math.round(r.width), Math.round(r.height)],
      radius: cs.borderTopLeftRadius === cs.borderBottomLeftRadius && cs.borderTopLeftRadius === cs.borderBottomRightRadius ? cs.borderTopLeftRadius : [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].join(' '),
      bg: cs.backgroundColor,
      innerW: Math.round(innerW),
      texts,
    };
  });
  return JSON.stringify({ ...meta, out });
})()`

/* ---------- CDP 小客户端 ---------- */
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.id = 0
    this.pending = new Map()
    this.events = []
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res())
      this.ws.addEventListener('error', (e) => rej(new Error('ws error: ' + (e.message || 'unknown'))))
    })
    this.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id)
        this.pending.delete(m.id)
        m.error ? rej(new Error(m.error.message)) : res(m.result)
      } else if (m.method) {
        this.events.push(m)
      }
    })
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    return new Promise((res, rej) => this.pending.set(id, { res, rej }))
  }
  waitEvent(name, timeout = 30000) {
    return new Promise((res, rej) => {
      const t0 = Date.now()
      const tick = () => {
        const hit = this.events.find((e) => e.method === name)
        if (hit) return res(hit)
        if (Date.now() - t0 > timeout) return rej(new Error('等待超时: ' + name))
        setTimeout(tick, 80)
      }
      tick()
    })
  }
  close() { try { this.ws.close() } catch {} }
}

/* ---------- 主流程 ---------- */
const PORT = Number(process.env.SHOT_PORT || 9337)
/* profile 走临时目录；C 盘紧张时用 SHOT_TMP 指到别的盘（浏览器 profile 写满会
   表现为「扩展加载失败」之类与页面无关的报错，白查半天） */
const TMP_DIR = process.env.SHOT_TMP || join(tmpdir(), 'shot-page-tmp')
const PROFILE = join(TMP_DIR, 'profile')
mkdirSync(PROFILE, { recursive: true })
mkdirSync(OUT, { recursive: true })

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    'about:blank',
  ],
  { env: { ...process.env, TEMP: TMP_DIR, TMP: TMP_DIR }, stdio: 'ignore' },
)

let cdp
try {
  let version
  for (let i = 0; i < 80; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break }
    catch { await sleep(250) }
  }
  if (!version) throw new Error('Chrome 没起来（端口 ' + PORT + ' 没响应）')

  cdp = new CDP(version.webSocketDebuggerUrl)
  await cdp.ready

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Page.enable', {}, S)
  await cdp.send('Runtime.enable', {}, S)
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 1000, deviceScaleFactor: DPR, mobile: false },
    S,
  )

  console.log(`URL  = ${URL_}\nSEL  = ${SEL}\n输出 = ${join(OUT, NAME + '-{light,dark}.png')}\n`)

  for (const scheme of ['light', 'dark']) {
    cdp.events.length = 0
    await cdp.send(
      'Emulation.setEmulatedMedia',
      { media: 'screen', features: [{ name: 'prefers-color-scheme', value: scheme }] },
      S,
    )
    await cdp.send('Page.navigate', { url: `${URL_}${URL_.includes('?') ? '&' : '?'}t=${Date.now()}` }, S)
    await cdp.waitEvent('Page.loadEventFired')
    await sleep(2000) // 等字体与客户端 hydration

    if (SCROLL) {
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo(0, ${SCROLL})` }, S)
      await sleep(900) // 等滚动结束（有平滑滚动与懒加载）
    }

    const p = await cdp.send('Runtime.evaluate', { expression: probeExpr(SEL), returnByValue: true }, S)
    const r = JSON.parse(p.result.value)
    console.log(`===== ${scheme} ===== ${r.title} | .dark=${r.dark} | 命中 ${r.matches} 个`)
    for (const c of r.out) {
      console.log(`  ${c.sel}  盒 ${c.box[0]}x${c.box[1]}  圆角 ${c.radius}  底 ${c.bg}`)
      if (!c.texts?.length) { console.log('     （未找到带文字的子孙）'); continue }
      for (const t of c.texts) {
        const of = t.overflowPx
        const ofTxt = of === null ? '' : of > 0 ? `  ❌ 溢出 ${of}px` : `  ✅ 余量 ${-of}px`
        /* WCAG: 大字（≥24px）阈值 3:1，其余 4.5:1 */
        const big = parseFloat(t.fontSize) >= 24
        const need = big ? 3 : 4.5
        const ctTxt = t.contrast === null
          ? ''
          : `  对比度 ${t.contrast}:1 ${t.contrast >= need ? '✅' : '❌'}（${big ? '大字' : '小字'}阈值 ${need}:1${t.alpha < 1 ? `，已折算 opacity ${t.alpha}` : ''}）`
        console.log(
          `     ${t.sel} ${JSON.stringify(t.text)} ${t.fontSize}\n` +
          `       文字宽 ${t.textW ?? '?'} / 可用 ${c.innerW}  行数 ${t.lines ?? '?'}${ofTxt}${ctTxt}`,
        )
      }
    }

    const shot = await cdp.send(
      'Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: !VIEWPORT_ONLY },
      S,
    )
    const file = join(OUT, `${NAME}-${scheme}.png`)
    writeFileSync(file, Buffer.from(shot.data, 'base64'))
    console.log(`  -> ${file}`)
  }

  /* 局部放大：确认接缝/圆角这类 1px 问题 */
  if (ZOOM) {
    const box = await cdp.send(
      'Runtime.evaluate',
      { expression: `(() => {
        const el = document.querySelector(${JSON.stringify(ZOOM_SEL)});
        if (!el) return 'null';
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height,
          radius: cs.borderTopLeftRadius, bg: cs.backgroundColor });
      })()`, returnByValue: true }, S)
    const info = JSON.parse(box.result.value)
    if (info === null) {
      console.log(`\n⚠️ --zoom 找不到 ${ZOOM_SEL}`)
    } else {
      const W = 64, H = 44
      const clip = {
        tl: { x: info.x - 4, y: info.y - 4 },
        tr: { x: info.x + info.w - W + 4, y: info.y - 4 },
        bl: { x: info.x - 4, y: info.y + info.h - H + 4 },
        br: { x: info.x + info.w - W + 4, y: info.y + info.h - H + 4 },
      }[ZOOM]
      if (!clip) throw new Error('--zoom 只认 tl / tr / bl / br，收到: ' + ZOOM)
      const zs = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: { ...clip, width: W, height: H, scale: ZOOM_SCALE },
      }, S)
      const zfile = join(OUT, `_zoom-${ZOOM}.png`)
      writeFileSync(zfile, Buffer.from(zs.data, 'base64'))
      console.log(`\n局部放大 ${ZOOM}: 元素 ${Math.round(info.w)}x${Math.round(info.h)} 圆角 ${info.radius} 底 ${info.bg}`)
      console.log(`  -> ${zfile}`)
    }
  }
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
} finally {
  cdp?.close()
  try { chrome.kill() } catch {}
}
