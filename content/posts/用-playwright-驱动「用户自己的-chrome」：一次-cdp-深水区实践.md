---
title: 用 Playwright 驱动「用户自己的 Chrome」：一次 CDP 深水区实践
description: |-
  一个 Electron 求职助手的技术复盘。真正的难点从来不是「怎么点按钮」，而是
  怎么在不惊动风控的前提下、稳定地操控一个不属于你的浏览器，此文章只记录技术学习，不涉及对其他第三方平台造成破坏。
date: 2026-08-13
updated: 2026-08-13
tags:
  - Electron
  - Playwright
  - Nodejs
  - Vue3
  - TypeScript
kicker: Playwright
cover: ''
featured: true
draft: false
serif: true
author: L
---

# 用 Playwright 驱动「用户自己的 Chrome」：一次 CDP 深水区实践

> 一个 Electron 求职助手的技术复盘。真正的难点从来不是「怎么点按钮」，而是怎么在不触发风控的前提下、稳定地操控一个不属于你的浏览器。

***

## 一、先讲清楚问题

我们要做的是一个求职辅助工具：帮用户批量采集岗位、批量投递、并监控 HR 回复。

| 常规做法 | 在招聘站点的现实 |
| --- | --- |
| 无头浏览器 + 独立 profile | 全新指纹：无历史、无 cookie、无扩展、WebRTC 全空 → 风控分极高 |
| 复制用户 profile 启动副本 | 复制的是\*\*快照\*\*，服务端会话可能已失效；触发异地登录风控；复制活跃 profile 有锁与损坏风险 |
| 自己造一个浏览器去登录 | 用户得重新扫码，且新会话本身就是最可疑的信号 |

于是我们把方向彻底翻转：

_不去"造一个浏览器"，而是"借用用户真实的浏览器"。_

用户自己开着 Chrome 登录着 某直聘平台，我们**直接附着**上去，在后台标签页里干活。
站点看到的就是一个正常用户 —— 只留下两处可防守的破绽：**调试端口探测**与**行为节奏**。

方向定了，真正的坑才刚开始。下面是一条完整的踩坑链。

***

## 二、第一个深坑：Chrome 150 把 HTTP 调试 API 锁死了

一切的起点，是 Playwright 的标准附着姿势：

`const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')`

这是官方文档里最主流、社区案例最多的一条路。我理所当然地用了它但是 ——
**理所当然地翻车了**。

### 现象

用户明明已经用 \`--remote-debugging-port=9222\` 启动了 Chrome，端口也通，
但 \`connectOverCDP\` 就是连不上。

### 诊断

首先查找了浏览器设置原因不是浏览器的设置的原因，于是我写了个探针把 HTTP 响应原样打出来：

`// scripts/diag-cdp.cjs（节选）`
`const r = await httpGet(port, '/json/version')`
`` console.log(`[PORT ${port}] status=${r.status}`, r.body) ``

结果一目了然：

`[PORT 9222] LISTENING, status=403`

\*\*TCP 层是通的，但 HTTP 调试 API 被 Chrome 挡在 403。\*\*

这是 Chrome 150 的变更：\*\*默认 user-data-dir（也就是用户日常在用的那个目录）
会拒绝 HTTP 调试接口\*\* \`/json/version\`、\`/json/list\` 一律 403。

而 Playwright 的 \`connectOverCDP\` 恰恰依赖 \`/json/version\` 去拿
\`webSocketDebuggerUrl\`。依赖链断了，附着自然失败。

### 关键突破：\`DevToolsActivePort\`

我们转而直接去翻 Chrome 的 user-data 目录，发现了这个文件：

\`\`\`
%LOCALAPPDATA%\Google\Chrome\User Data\DevToolsActivePort
\`\`\`

内容只有两行：

\`\`\`
58231
/devtools/browser/1c573d0f-a51b-4559-85bd-aff29fc4b11f
\`\`\`

- 第一行是\*\*随机调试端口\*\*（注意：不是 9222，Chrome 每次启动都随机）；
- 第二行是 \*\*WebSocket 路径\*\*。

HTTP API 被锁了，但这个\*\*文件仍然照常写入\*\*，且记录了真正的 ws 端点。

于是我们手写了一个最原始的 WebSocket 握手探针，直接用裸 TCP 验证可行性：

\`\`\`js
// scripts/ws-handshake.cjs（节选核心）
sock.write(
  \`GET ${path} HTTP/1.1\r\n\` +
  \`Host: 127.0.0.1:${port}\r\n\` +
  'Upgrade: websocket\r\n' +
  'Connection: Upgrade\r\n' +
  \`Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\` +
  'Sec-WebSocket-Version: 13\r\n\r\n'
)
\`\`\`

探针结果给出了三条决定性事实：

| 探测目标 | 结果 | 含义 |
| --- | --- | --- |
| \`wsPath\` 真实端点 | \*\*101 Switching Protocols\*\* | ws 直连完全可用 |
| \`/json/version\` | \*\*403\*\* | HTTP API 被锁死（复现） |
| \`/devtools/browser/00000000-...\`（假 uuid） | \*\*仍然 101\*\* | 该端点\*\*不校验 uuid\*\* |

最后一条尤其重要：\*\*只要拿到端口和 ws 路径，就能连上，哪怕 uuid 是编的。\*\*

结论：\*\*绕过 HTTP API，直接读 \`DevToolsActivePort\` 第二行连 ws。\*\*

### 但 Playwright 只认 HTTP API —— 那就给它一个

问题来了：我们想保留 Playwright 的完整能力（locator、自动等待、断言），
但 \`connectOverCDP\` 只会读 \`/json/version\`。

解法很优雅 —— \*\*在本地起一个极小的 HTTP 桥\*\*，把真实的 ws 端点包装出去：

\`\`\`ts
// src/main/automation/browser-manager.ts（节选）
async function startCdpBridge(port: number, wsPath: string): Promise<Server> {
  const wsUrl = \`ws://127.0.0.1:${port}${wsPath}\`
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.url?.startsWith('/json/version')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        // 把我们发现的真实 ws 端点冒充成 Chrome 的官方响应
        res.end(JSON.stringify({
          Browser: 'chrome',
          'Protocol-Version': '1.3',
          webSocketDebuggerUrl: wsUrl
        }))
      } else {
        res.statusCode = 404
        res.end('{}')
      }
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))  // 随机本地端口
  })
}
\`\`\`

Playwright 连上桥 → 桥把它的 \`/json/version\` 请求回填真实 ws 地址 →
Playwright 拿到地址后自己建 ws 连接 → \*\*直连用户浏览器，且保留全部 Playwright 能力\*\*。

桥随连接销毁，不污染用户 Chrome。整个链路验证脚本在 \`scripts/bridge-probe.cjs\`：

\`\`\`
bridge ready: http://127.0.0.1:54321
connectOverCDP OK, contexts: 1, existing pages: 3
newPage OK (new tab in YOUR chrome), url: about:blank
goto zhipin OK, title: 某直聘
login check (cookies): ...   ← 登录态直接可用
DONE - your chrome untouched
\`\`\`

\*\*直连用户 Chrome 成功，用户原窗口纹丝不动。\*\*

***

## 三、第二个深坑：别对着假想敌写代码

连上了之后，我们开始担心一个经典问题：

> \`navigator.webdriver\` 是 \`true\`，站点一眼就能看出是自动化。

于是第一反应就是注入补丁伪装它。\`addInitScript\`、CDP 注入，全都试了。

\*\*结果全军覆没。\*\* 我们写了个探针把这件事彻底钉死：

\`\`\`js
// scripts/patchright-probe.cjs（节选）
await session.send('Page.addScriptToEvaluateOnNewDocument', {
  source: "Object.defineProperty(navigator,'webdriver',{get:()=>undefined,configurable:true})"
})
// ...
console.log('navigator.webdriver:', await page.evaluate(() => navigator.webdriver))
\`\`\`

| 连接方式 | \`navigator.webdriver\` |
| --- | --- |
| Playwright 经桥 connectOverCDP | \`true\` |
| 裸 ws 直连（某直聘Hunter 方式） | \`true\` |
| \*\*只带 \`--remote-debugging-port\` 启动，不做任何连接\*\* | \`true\` |
| \`context.addInitScript\` 补丁 | \*\*脚本根本没执行\*\*（页面无任何补丁痕迹） |
| CDP \`Page.addScriptToEvaluateOnNewDocument\` | \*\*同样没执行\*\* |

结论非常清晰：

> \*\*Chrome 只要带着调试端口启动，\`webdriver\` 就是环境级 \`true\` —— 与连接方式无关，
> 任何 JS 注入都改不了，因为补丁脚本压根没机会执行。\*\*

而我们在研究参考实现时发现：\*\*同款方案顶着 \`webdriver=true\` 长期运行，从未被检测。\*\*

这是一个转折点。我们\*\*删掉了所有无效的注入代码\*\*，包括之前写好的 \`injectWebdriverPatch\`。

### 教训

> \*\*风控对抗的第一步，是先搞清楚站点到底在检测什么，而不是对着想象中的敌人写代码。\*\*

那站点真正的检测点在哪？我们锁定了两个，并且\*\*都做了量化验证\*\*。

### 检测点 1：本地调试端口探测

站点的前端 JS 会去 \`fetch('http://127.0.0.1:9222')\`。
只要 TCP 有响应 —— \*\*哪怕返回 403/404 —— 就足以证明 DevTools 服务存在\*\*。

对策是用 CDP 的请求拦截能力，把这类请求直接掐断：

\`\`\`ts
// src/main/automation/browser-manager.ts（节选）
private async guardDebugPort(page: Page): Promise<void> {
  if (this.guardedPages.has(page)) return
  const ports = new Set<number>()
  if (this.cdpPort > 0) ports.add(this.cdpPort)
  for (const p of EXTERNAL_PORTS) ports.add(p)   // [9222, 9229, 9333, 9223, 9224]

  const session = await page.context().newCDPSession(page)
  const patterns = [...ports].flatMap((p) => [
    { urlPattern: \`http://127.0.0.1:${p}/\*\`, requestStage: 'Request' as const },
    { urlPattern: \`http://localhost:${p}/\*\`, requestStage: 'Request' as const }
  ])
  await session.send('Fetch.enable', { patterns })
  session.on('Fetch.requestPaused', (event) => {
    const { requestId } = event as { requestId: string }
    // 直接让请求"连接被拒绝"，站点看到的是"这里没有服务"
    session.send('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' })
      .catch(() => null)
  })
  this.guardedPages.add(page)
}
\`\`\`

关键在于\*\*返回 \`ConnectionRefused\` 而不是简单的 \`abort\`\*\* ——
让页面感知到的是"端口上什么都没有"，而不是"请求被篡改了"。

\`scripts/guard-probe.cjs\` 的对照实验给出了铁证：

\`\`\`
[no-guard]  fetch debug port -> SERVICE DETECTED (resolved)
[guarded]   fetch debug port -> BLOCKED: Failed to fetch
\`\`\`

守卫前 \`SERVICE DETECTED\`，守卫后 \`BLOCKED\`。\*\*这个检测点被确切地关掉了。\*\*

### 检测点 2：行为节奏

固定间隔、固定等待时长，是最强的机器特征。

对策是把所有"等待"都改成随机区间，并叠加更贴近真人的节流模型：

\`\`\`ts
// src/main/jobs/service.ts（节选）
private async waitApplyInterval(): Promise<void> {
  const now = Date.now()
  const elapsedSec = (now - this.lastApplyAt) / 1000

  // 高斯分布：均值 120s、标准差 30s（而不是均匀随机）
  let base = Math.max(0, this.gauss(120, 30) - elapsedSec)

  // 5% 概率"人类犹豫"
  if (Math.random() < 0.05) base += 2 + Math.random() \* 3

  // 突发惩罚：短时间投太多就加罚
  const recent15 = this.recentApplyTimes.filter((t) => now - t <= 15000).length
  const recent45 = this.recentApplyTimes.filter((t) => now - t <= 45000).length
  if (recent45 >= 6)      base += 4 + Math.random() \* 3
  else if (recent15 >= 3) base += 1.2 + Math.random() \* 1.6

  if (base > 0) await cancellableSleepMs(base \* 1000, () => this.cancelled)
}
\`\`\`

配套的还有一套\*\*渐进退避 + 熔断\*\*：

- 连续 2 次失败 → 暂停 120s；
- 连续 3 次失败 → \*\*熔断\*\*，导出加密执行记录（\`.bhlog\`）并终止本轮任务 ——
  因为此时大概率已被风控，必须停下来等恢复。

以及一个容易被忽略但很真实的细节：
\*\*点"沟通"前先随机浏览 15-30 秒。\*\* 打开页面立刻点按钮，是最典型的机器行为。

### 额外收获：搜索页也用「逐标签」模式

参考实现的做法是：\*\*每翻一页、每个详情页都新开一个标签页，用完即关\*\*，
而不是在单个标签页里连续 \`goto\`。

这样既更像真人的浏览习惯，也顺带把每页采集量从 15 条提升到了 30-40 条
（滚动两次才能加载出首屏以外的岗位）。

***

## 四、第三个深坑：把 CDP 命令队列堵死（"一直在采集中"）

这是最难查的一个 bug，也是本次工程里最有价值的一课。

### 现象

后台标签页卡住、转圈，应用内 CPU 飙升，
外部探针去探测 Chrome 调试端口\*\*完全无响应\*\*（端口假死）。

### 根因链

顺着日志往下挖，还原出这样一条因果链：

1. ws 连接断开 → 触发自动重连（\`scheduleReconnect\`）；
2. 重连逻辑是\*\*每 5 秒一次\*\*的探测，而 \`connectOverCDP\` 默认 30s 超时且\*\*无兜底\*\*，
   于是重连期间堆积了 6+ 条未完成的连接尝试；
3. Chrome 调试服务被占满 → 会话命令排队 →
   后续的 \`Target.createTarget\` \*\*没有超时保护，直接挂起\*\*；
4. 前台自动采集永远等不到结果 → \*\*"一直在采集中"\*\*。

\*\*一句话总结：所有 CDP 调用都必须是"有界"的。\*\*
没有超时的 CDP 命令 = 一颗随时会炸的定时炸弹。

### 修复

第一，给所有连接加\*\*强制超时\*\*：

\`\`\`ts
// src/main/automation/browser-manager.ts
function connectCdp(endpoint: string, timeoutMs = 6000): Promise<Browser> {
  return Promise.race([
    chromium.connectOverCDP(endpoint),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(\`CDP 连接超时（${timeoutMs}ms）\`)), timeoutMs)
    )
  ])
}
\`\`\`

第二，重连改为\*\*串行 + 指数退避\*\*，并用互斥锁防止并发堆积：

\`\`\`ts
private scheduleReconnect(): void {
  if (this.reconnectTimer || this.reconnectRunning) return   // 互斥
  const attempt = async (): Promise<void> => {
    if (this.reconnectRunning) return
    this.reconnectRunning = true
    try {
      /\* ...只尝试"直连已存在的浏览器"... \*/
    } finally {
      this.reconnectRunning = false
    }
  }
  const arm = (): void => {
    // 5s → 10s → 20s → 40s → 60s 封顶，成功即归零
    const delay = Math.min(5000 \* Math.pow(2, this.reconnectAttempts), 60000)
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      await attempt()
      arm()
    }, delay)
  }
  attempt().finally(arm)
}
\`\`\`

第三，\*\*移除自动重连里的 profile 复制/进程启动逻辑\*\* ——
重连只做"发现并连上已存在的浏览器"，绝不主动拉起新进程。

### 连带的两个同类陷阱

排查过程中还揪出两个同源问题，都是"底层输入无超时"：

\*\*陷阱 A：\`page.mouse.wheel\` 会堵死队列。\*\*

\`\`\`ts
// ❌ 危险：Chrome 对后台标签页的滚轮输入可能不响应
await page.mouse.wheel(0, 2400)

// ✅ 安全：Runtime.evaluate 对后台标签稳定响应，滚动事件照常触发懒加载
await page.evaluate((dy) => scrollBy({ top: dy, behavior: 'instant' }), 2400)
\`\`\`

Chrome 对后台标签页的 \`Input.dispatchMouseEvent\` 可能不响应，
命令永远 pending，\*\*把该标签页整条 CDP 队列堵死\*\*。改用 \`evaluate\` 后彻底消失。

\*\*陷阱 B：\`page.keyboard.type\` 同理。\*\*

一律改用 \`locator.fill()\`，并带上超时。

> \*\*工程原则：在这个环境里，凡是走底层输入/设备层的 API，都要假设它会挂起。\*\*
> 能用 \`evaluate\` 就用 \`evaluate\`，能用 \`locator\` 就用 \`locator\`。

***

## 五、第四个深坑：某直聘的薪资字体加密

采集岗位时发现薪资字段全是乱码。

排查后发现：\*\*数字被替换成了 Unicode 私有区码点\*\*（\`U+E000\`–\`U+F8FF\`），
例如 \`\uE032\` 实际代表 \`'1'\`；页面再注入一个自定义字体，把码点渲染成数字字形。

所以 \`textContent\` 读出来永远是乱码 —— 因为它在字符层面就不是数字。

### 解法：用 canvas 逐像素比对还原

思路是：\*\*既然字体能把码点渲染成数字，那我就让浏览器渲染一遍，再跟真数字做像素比对。\*\*

\`\`\`ts
// src/main/automation/safe-command.ts（节选，运行在页面上下文）
const renderBits = (ch, font, canvas) => {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.font = font                 // 用页面真实字体
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#000'
  ctx.fillText(ch, 2, 2)
  const data = ctx.getImageData(0, 0, SIZE, SIZE).data
  // 取 alpha 通道二值化成位图
  const bits = new Uint8Array(SIZE \* SIZE)
  for (let i = 0; i < SIZE \* SIZE; i++) bits[i] = data[i \* 4 + 3] > 100 ? 1 : 0
  return bits
}

const decodeSalary = async (text, font) => {
  // 1. 先把所有 PUA 码点收集出来
  const puaChars = new Set()
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp >= 0xe000 && cp <= 0xf8ff) puaChars.add(ch)
  }
  if (puaChars.size === 0) return text.trim()

  await doc.fonts?.ready          // 等字体加载完，否则渲染出来是空白

  // 2. 渲染 0-9 作为参考集
  const canvas = mkCanvas()
  const refs = ['0','1','2','3','4','5','6','7','8','9'].map((d) => ({
    d, bits: renderBits(d, font, canvas)
  }))

  // 3. 每个 PUA 字符渲染一遍，逐像素找最像的数字
  const map = new Map()
  for (const ch of puaChars) {
    const bits = renderBits(ch, font, canvas)
    let best = '', bestScore = 0
    for (const ref of refs) {
      const s = similarity(bits, ref.bits)   // 相同像素占比
      if (s > bestScore) { bestScore = s; best = ref.d }
    }
    if (bestScore > 0.85) map.set(ch, best)  // 置信度阈值，宁缺毋滥
  }

  // 4. 逐字符替换，未识别的保留原样
  let out = ''
  for (const ch of text) out += map.get(ch) ?? ch
  return out.trim()
}
\`\`\`

这段代码跑在页面上下文里，\`SIZE = 64\` 的位图逐像素比对，
\*\*毫秒级还原整个列表的薪资\*\*，不需要引入任何 OCR 依赖。

***

## 六、架构：把"随意执行 JS"关进笼子

反检测之外，还有一个我们很在意的工程问题：\*\*安全边界\*\*。

早期做法是主进程直接往页面里塞 JS 字符串。这有两个问题：

1. 任意 JS 字符串 = \*\*注入面\*\*；
2. 页面结构一变，散落各处的 JS 就全烂了。

于是一期重构把页面操作收敛成一套\*\*结构化指令集\*\*：

\`\`\`ts
// src/main/automation/safe-command.ts
export type SafeCommand =
  | { cmd: 'extract';      selector: string; attr?: 'text' | 'href' | 'value' | 'class' }
  | { cmd: 'extractItems'; itemSelector: string; fields: Array<{ key: string; selector: string }>; max?: number }
  | { cmd: 'extractJobs' }
  | { cmd: 'fill';         selector: string; value: string }
  | { cmd: 'click';        selector: string; timeout?: number }
  | { cmd: 'smartClick';   text: string; role?: 'button' | 'link'; exact?: boolean }
  | { cmd: 'wait';         condition: 'load' | 'networkidle' | 'timeout'; timeout: number }
\`\`\`

配套一个执行器 \`SafeCommandExecutor\`。这里有两个设计收益：

\*\*收益 1：天然防注入。\*\* \`value\` 只作为\*\*数据\*\*传给 Playwright 的 Locator API，
不参与字符串拼接，不存在"用户输入变成代码"的路径。

\*\*收益 2：性能。\*\* 逐字段 \`locator\` 查询在 45 张卡片 × 6 字段的场景下
= 270 次 DOM 查询，实测要 \*\*5 分钟\*\*。改成单次 \`evaluate\` 批量提取后是\*\*毫秒级\*\*。

> 所以 \`extractJobs\` 是这条"不执行任意 JS"原则里\*\*唯一被明确豁免\*\*的指令 ——
> 因为它的性能差异是数量级的，且它是\*\*固定语义、无外部输入\*\*的封闭实现。

### 幂等的"智能点击"

\`smartClick\` 是一个三级降级的多模态定位器，用于应付"按钮找不到"的场景：

\`\`\`ts
// src/main/automation/selector-engine.ts
export async function smartClick(page: Page, options: SmartClickOptions): Promise<boolean> {
  const { text, role, exact } = options
  const clean = text.replace(/\s+/g, ' ').trim()

  // 1. 语义化属性（框架无关）：data-testid / ka / aria-label / title
  for (const sel of [
    \`[data-testid\*="${cssEscape(clean)}"]\`,
    \`[ka="${cssEscape(clean)}"]\`,
    \`[aria-label="${cssEscape(clean)}"]\`,
    \`[title="${cssEscape(clean)}"]\`
  ]) {
    const loc = page.locator(sel).first()
    if (await loc.count().catch(() => 0)) {
      await loc.click({ timeout: 6000 }).catch(() => null)
      return true
    }
  }

  // 2. role + 文本精确匹配
  if (role) {
    const loc = page.getByRole(role, { name: clean, exact: exact ?? true }).first()
    if (await loc.count().catch(() => 0)) {
      await loc.click({ timeout: 6000 }).catch(() => null)
      return true
    }
  }

  // 3. 终极降级：候选元素文本相似度（Levenshtein）
  const candidates = page.locator('button, a, [role="button"], [class\*="btn"], [class\*="item"]')
  let bestIndex = -1, bestScore = 0.6
  for (let i = 0; i < await candidates.count().catch(() => 0); i++) {
    const t = (await candidates.nth(i).textContent({ timeout: 3000 }).catch(() => '') ?? '')
      .replace(/\s+/g, ' ').trim()
    const s = similarity(t, clean)
    if (s > bestScore) { bestScore = s; bestIndex = i }
  }
  if (bestIndex >= 0) {
    await candidates.nth(bestIndex).click({ timeout: 6000 }).catch(() => null)
    return true
  }
  return false
}
\`\`\`

注意第 3 级的这条注释 —— 它是踩坑换来的：

\`\`\`ts
// 禁止 page.mouse.click：底层鼠标动作无超时，Chrome 不响应时命令永久
// pending 并堵死该标签页的 CDP 命令队列
\`\`\`

\*\*始终走 \`locator.click()\`，永不降级到 \`mouse.click()\`。\*\*

***

## 七、稳定性：三个必须做对的细节

### 7.1 后台开标签，而不是抢焦点

用户正在用他的 Chrome，我们不能弹窗打扰他。

\`\`\`ts
// src/main/automation/browser-manager.ts（节选）
const cdp = await this.browser.newBrowserCDPSession()
await Promise.race([
  cdp.send('Target.createTarget', { url: url || 'about:blank', background: true }),
  new Promise((_, reject) => setTimeout(() => reject(new Error('createTarget timeout')), 6000))
])
\`\`\`

\`background: true\` —— \*\*后台创建标签页，不抢焦点、不弹前台窗口。\*\*

### 7.2 附着空浏览器时，contexts() 可能是空的

这是个很隐蔽的坑：如果浏览器附着上来时\*\*一个页面 target 都没有\*\*，
\`connectOverCDP\` 拿到的 \`contexts()\` 是空数组，Playwright 就无法 \`newPage()\`。

兜底方案是走 CDP HTTP API 补开一个空白页，再等 Playwright 把它纳入 context：

\`\`\`ts
private async ensurePageTarget(): Promise<boolean> {
  const contexts = this.browser.contexts()
  if (contexts.some((c) => c.pages().length > 0)) return true

  await cdpNewPage(this.cdpPort)   // PUT /json/new —— 绕过 Playwright 直接建页

  for (let i = 0; i < 10; i++) {   // 最多等 3 秒
    await new Promise((r) => setTimeout(r, 300))
    if (this.browser.contexts()[0]) return true
  }
  return false
}
\`\`\`

### 7.3 消息 diff：虚拟滚动带来的三个连环坑

会话监控需要做"新消息 diff"。这里踩了三个坑，每一个都会导致\*\*漏报或重复弹\*\*：

\*\*坑 1：\`extractItems\` 按 DOM 顺序取前 N 条。\*\*

\`\`\`ts
max: 200        // ✅ 先放大提取
// ... 然后
return out.slice(-60)   // ✅ 只保留尾部（最新）60 条
\`\`\`

如果直接写 \`max: 60\`，截掉的是\*\*最新\*\*的消息 —— 新回复必然漏采。

\*\*坑 2：消息区是虚拟滚动/懒加载。\*\*

打开会话不滚动，最新消息根本不在 DOM 里。所以提取前必须滚到底：

\`\`\`ts
for (let i = 0; i < 3; i++) {
  await scrollToBottom(page)      // 滚最深可滚动容器 + body
  await cancellableSleep(rand(500, 800))
}
\`\`\`

\*\*坑 3：diff 必须做空白归一化。\*\*

\`\`\`ts
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()
\`\`\`

不归一化的话，渲染差异（换行、连续空格）会让历史消息被反复当成新消息弹出。

配合\*\*池消耗匹配\*\*（库中 HR 消息逐条 \`indexOf\` 消耗）来兼容同文本多条的情况，
以及 \*\*sha1 指纹幂等\*\*（而不是文本前 40 字符 + \`LIKE\` —— 消息含 \`%\`/\`_\` 时通配符会干扰）：

\`\`\`ts
const fingerprint = createHash('sha1').update(hrLast.text).digest('hex').slice(0, 24)
const done = getDb()
  .prepare("SELECT 1 FROM action_logs WHERE action = 'hr_replied' AND detail LIKE ? AND conversation_id = ? LIMIT 1")
  .get(\`%#${fingerprint}%\`, id)
if (done) continue
\`\`\`

### 7.4 可中断性：把"停止按钮"做真

这是个用户体感极强、但容易做假的点。

\`\`\`ts
/\*\*
 \* 可中断 sleep：500ms 分片等待，取消信号到达立即返回。
 \*/
function cancellableSleep(ms: number, isCancelled?: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + ms
    const tick = (): void => {
      if (isCancelled?.() || Date.now() >= deadline) { resolve(); return }
      setTimeout(tick, 500)
    }
    tick()
  })
}
\`\`\`

\*\*所有等待都必须走 \`cancellableSleep\`。\*\* 曾经有一处用了普通 \`sleep\`，
结果点了"停止"之后任务还跑了 30 多秒 —— 因为 15-30s 的浏览等待和 120s 的退避不可中断。

### 7.5 熔断时的现场取证

风控熔断时，最需要的是一份\*\*可复查的现场\*\*。

我们用环形缓冲区记录最近 50 条（指令 + 结果 + 截图），
熔断时导出成 AES-256-GCM 加密的 \`.bhlog\`：

\`\`\`ts
// src/main/automation/ring-buffer.ts（节选）
export(exportDir?: string) {
  const secret = createHash('sha256')
    .update(\`job-pilot::audit::${app.getPath('userData')}\`)
    .digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secret, iv)
  // ...加密后只写本地，永不上传云端
}
\`\`\`

截图是\*\*异步补录\*\*的，且带 10s 超时 —— 因为\*\*挂起的截图命令同样会堵死命令队列\*\*。

***

## 八、附赠的坑：Electron 主进程中文乱码

这个坑很小但很典型。

Windows 终端默认 GBK，Node 以 UTF-8 输出中文就乱码。修复是启动时切代码页：

\`\`\`ts
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' })
  } catch { /\* ... \*/ }
}
\`\`\`

但\*\*这里有个隐蔽的二次坑\*\*：我们最初写的是
\`if (process.stdout.isTTY && process.platform === 'win32')\`。

结果 \`chcp\` 从来没执行过 —— 因为 \*\*Electron 主进程的 stdout 是管道，
\`process.stdout.isTTY\` 是 \`undefined\`\*\*，条件永远为假，乱码持续存在。

\*\*教训：不要用 isTTY 判断 Electron 主进程的输出环境。\*\*

***

## 九、验证方法论：先测量，再修复

回头看，这个项目里真正让效率提升的，不是某个技术点，而是\*\*一套做事顺序\*\*：

\`\`\`
① 写一个最小探针，把真实响应打出来（不猜）
        ↓
② 用对照实验确认真相（guard-probe: 守卫前 SERVICE DETECTED / 守卫后 BLOCKED）
        ↓
③ 确认了再动手重构
        ↓
④ 留一个可复跑的验证脚本，防止版本漂移
\`\`\`

具体落到 \`scripts/\` 目录，每个坑都对应一个可复跑的探针：

| 探针脚本 | 验证的事 |
| --- | --- |
| \`ws-handshake.cjs\` | ws 101 握手、\`/json/version\` 403、假 uuid 仍 101 |
| \`bridge-probe.cjs\` | 本地桥全链路：直连用户 Chrome + 打开新标签 + 登录态可用 |
| \`guard-probe.cjs\` | 端口守卫对照实验（SERVICE DETECTED → BLOCKED） |
| \`patchright-probe.cjs\` | \`navigator.webdriver\` 实测 + 注入无效验证 |
| \`search-probe.cjs\` | 搜索页结构 + 各类风控元素探测 |
| \`tab-lifecycle.cjs\` | 后台/前台标签在连续导航下的存活表现 |
| \`diag-cdp.cjs\` | CDP 端口与 DevToolsActivePort 现状诊断 |

\*\*这个习惯救了我们两次\*\*：一次是发现 Chrome 150 的 403；
一次是发现注入补丁完全无效 —— 两次都是先测后改，没有一次是基于猜测的重构。

还有一条配套的纪律：\*\*任何 CDP 相关改动后，必须重跑一遍验证清单\*\*，
因为 Chrome 版本漂移会悄悄改掉 \`DevToolsActivePort\` 的行为。

***

## 十、复盘：五条真正重要的结论

\*\*1. 优先"借用真实环境"，而不是"伪造环境"。\*\*

当你要在一个有风控的站点上做自动化，
最好的伪装不是"更逼真的假指纹"，而是\*\*根本不需要伪装\*\* ——
直接使用用户真实的浏览器：真实的历史、真实的 cookie、真实的扩展、真实的硬件指纹。

我们砍掉了两版"复制/新建 profile"的方案，因为它们本质上都是
\*\*"再造一个浏览器让站点来检测"\*\*，而站点风控最敏感的特征恰恰是
"一个新 profile 和真用户的差异"。

\*\*2. 先搞清楚对手在检测什么，再写代码。\*\*

我们一度把大量精力投入到 \`navigator.webdriver\` 伪装上 ——
而实测证明它既改不了、也不是检测点。

\*\*先测量，再修复。\*\* 这句话省下的时间比任何一个技术优化都多。

\*\*3. 所有 CDP 调用都必须有界。\*\*

"一直在采集中"的根因就是一条无超时的命令挂起，堵死整条队列。
之后我们的铁律是：

- 连接要有超时；
- 重连要串行 + 退避，不能无界堆积；
- 底层输入 API（\`mouse.wheel\` / \`keyboard.type\`）一律替换为 \`evaluate\` / \`locator\`；
- 连截图都要带超时。

\*\*4. 能用有语义的 API，就不要用「裸操作」。\*\*

\`locator.click()\` 而非 \`mouse.click()\`，\`locator.fill()\` 而非 \`keyboard.type()\`。
语义 API 自带自动等待、可重试、可超时 —— 而裸操作只会把队列堵死。

\*\*5. 把"停止"和"取证"当成一等公民。\*\*

用户点了停止就必须立刻停（\`cancellableSleep\` 分片检查）；
出问题时必须有一份可复查的现场（环形缓冲 + 加密导出）。
这两件事决定了工具是"能用"还是"敢用"。

***

## 附录：关键代码位置

| 功能 | 文件 |
| --- | --- |
| 发现机制 / ws 直连 / 本地桥 / 端口守卫 / 后台开标签 | \`src/main/automation/browser-manager.ts\` |
| 结构化指令集（防注入 + 字体解码 + 性能优化） | \`src/main/automation/safe-command.ts\` |
| 多模态定位（三级降级 + Levenshtein 相似度） | \`src/main/automation/selector-engine.ts\` |
| 环形缓冲执行记录 + 加密导出 | \`src/main/automation/ring-buffer.ts\` |
| 平台适配（逐标签采集 + 随机节奏 + 幂等发送） | \`src/main/platform/zhipin.ts\` |
| 投递编排（高斯节流 + 突发惩罚 + 熔断） | \`src/main/jobs/service.ts\` |
| 会话监控（增量 diff + 幂等指纹） | \`src/main/monitor/service.ts\` |
| 探针与验证脚本 | \`scripts/\*.cjs\` |

\*\*技术栈\*\*：Electron 35 + patchright + React 18 + Tailwind + better-sqlite3（WAL）

***
