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
  - patchright
  - better-sqlite3
kicker: Playwright
cover: ''
featured: true
draft: false
serif: true
author: L
---

# 用 Playwright 驱动用户自己的 Chrome：一次踩坑记录

> 这是我在一个 Electron 求职助手项目里的技术复盘。
> 做完才发现，真正的难点从来不是"怎么点按钮"，而是怎么稳定操控一个不属于你的浏览器。

---

## 一、先想清楚方向：别造浏览器，借浏览器

项目要做的事很直接：批量采集岗位、批量投递、监控 HR 回复。听起来像爬虫，但常规那套在这儿全都不好使。

| 我们试过的做法 | 结果 |
| --- | --- |
| 无头浏览器 + 独立 profile | 全新指纹，没历史、没 cookie、没扩展，风控分直接拉满 |
| 复制用户 profile 启动副本 | 复制出来的是快照，会话可能早失效了，还容易触发异地登录 |
| 自己造个浏览器让用户登录 | 用户得重新扫码，而这个新会话本身就是最可疑的信号 |

后来我们把思路反过来：**不造浏览器，直接借用户自己的浏览器用。**

用户自己开着 Chrome、登录着某招聘平台，我们附着上去，在后台标签页里干活。站点看到的就是一个正常用户。剩下的破绽只有两处，而且都能防：**调试端口探测**和**行为节奏**。

方向定了，坑才刚开始。

---

## 二、Chrome 150 把标准附着路径堵死了

一开始我们用的是 Playwright 最主流的写法：

```ts
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
```

用户明明带着调试端口启动了 Chrome，端口也通，**就是连不上**。

我们没继续猜，先写了个探针把真实响应打出来：

```
[PORT 9222] LISTENING, status=403
```

TCP 是通的，但 HTTP 调试 API 被 403 拦了。这是 Chrome 150 的变更：默认 user-data-dir（也就是用户日常在用的那个）会拒绝 `/json/version`。而 `connectOverCDP` 恰恰靠它拿 ws 地址，依赖链就这么断了。

### 转机在一个没人注意的文件里

我们去翻 Chrome 的 user-data 目录，发现 `DevToolsActivePort` 里只有两行：

```
58231
/devtools/browser/1c573d0f-a51b-4559-85bd-aff29fc4b11f
```

第一行是**随机调试端口**，第二行是 **WebSocket 路径**。HTTP API 被锁了，但这个文件照常写入。

我们手写了个裸 TCP 探针做握手验证，拿到三条关键结论：

| 探测目标 | 结果 | 含义 |
| --- | --- | --- |
| 真实 ws 端点 | **101** | ws 直连完全可用 |
| `/json/version` | **403** | HTTP API 确实被锁死 |
| 假 uuid 的 ws 端点 | **101** | 这个端点**不校验 uuid** |

结论很清楚：**绕过 HTTP API，直接读文件连 ws。**

### 给 Playwright 补一个它认的接口

问题是 `connectOverCDP` 只认 HTTP。我们的解法是起一个极小的本地桥，把真实的 ws 地址伪装成 Chrome 的响应：

```ts
// 本地桥：把真实 ws 端点包装成 /json/version 响应
res.end(JSON.stringify({
  'Protocol-Version': '1.3',
  webSocketDebuggerUrl: `ws://127.0.0.1:${port}${wsPath}`  // 读文件得来的真实端点
}))
```

Playwright 连桥，桥回填真实地址，Playwright 自己建 ws，最后直连用户浏览器。locator、自动等待这些能力全都保留。桥随连接销毁，不污染用户的 Chrome。

---

## 三、不能靠想象写代码

连上之后，第一反应是那个经典问题：`navigator.webdriver` 是 `true`，站点一眼看穿。于是我们开始写注入补丁。

**全军覆没。**

探针把结论钉死了：

| 连接方式 | `navigator.webdriver` |
| --- | --- |
| Playwright 经桥连接 | `true` |
| 裸 ws 直连 | `true` |
| **只带调试端口启动、不做任何连接** | `true` |
| `addInitScript` 补丁 | **脚本根本没执行** |

**Chrome 只要带着调试端口启动，`webdriver` 就是环境级 `true`，跟连接方式无关，任何 JS 注入都改不了。** 而参考实现顶着这个值长期运行，从来没被检测过。

于是我们把所有无效的注入代码全删了。

> **教训：风控对抗的第一步是搞清楚站点到底在检测什么，而不是对着想象中的敌人写代码。**

真实检测点是另外两个，我们都做了量化验证。

### 检测点 1：调试端口探测

站点前端会 `fetch('http://127.0.0.1:9222')`。**只要 TCP 有响应，哪怕返回 403，就足以证明 DevTools 服务存在。**

对策是用 CDP 拦截这类请求，直接掐断：

```ts
await session.send('Fetch.enable', { patterns })
session.on('Fetch.requestPaused', ({ requestId }) => {
  // 关键：返回 ConnectionRefused，让页面以为"这里什么都没有"
  session.send('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' })
})
```

对照实验是铁证：

```
[no-guard]  fetch debug port -> SERVICE DETECTED
[guarded]   fetch debug port -> BLOCKED
```

### 检测点 2：行为节奏

固定间隔是最强的机器特征。对策是把所有等待改成随机区间，再叠加一层真人模型：

- 投递间隔用**高斯分布**（均值 120s、标准差 30s），而不是均匀随机；
- 5% 概率追加"人类犹豫"；
- **突发惩罚**：15 秒内投过 3 个就加罚；
- **渐进退避 + 熔断**：连续 3 次失败就终止本轮，因为这时候大概率已经被风控了；
- 点"沟通"前先**随机浏览 15-30 秒**——打开即点是典型的机器行为。

---

## 四、最难查的 bug：CDP 命令队列被堵死

现象是：后台标签页卡住、CPU 飙升、调试端口假死无响应——也就是用户看到的"一直在采集中"。

根因是一条因果链：

1. ws 断开，触发重连（每 5 秒一次）；
2. `connectOverCDP` 默认 30s 超时且无兜底，重连期间**堆积了 6+ 条未完成连接**；
3. 调试服务被占满，命令开始排队，后续的 `Target.createTarget` **没有超时保护，直接挂起**；
4. 前台采集永远等不到结果。

**一句话：没有超时的 CDP 命令，就是一颗定时炸弹。**

修复做了三件事：

```ts
// 1. 所有连接强制超时
Promise.race([chromium.connectOverCDP(endpoint), timeout(6000)])

// 2. 重连串行 + 指数退避（5s → 10s → … → 60s 封顶）
const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts), 60000)

// 3. 重连只"发现并连上已存在的浏览器"，绝不主动拉起新进程
```

排查过程中还揪出两个同源陷阱，都是"底层输入无超时"：

| ❌ 危险 | ✅ 安全 | 原因 |
| --- | --- | --- |
| `page.mouse.wheel()` | `page.evaluate(() => scrollBy(...))` | 后台标签页的滚轮输入可能不响应，命令永久 pending |
| `page.keyboard.type()` | `locator.fill()` | 同理，底层键盘输入无超时 |

> **工程原则：凡是走底层设备层的 API，都要假设它会挂起。**
> 能用 `evaluate` 就用 `evaluate`，能用 `locator` 就用 `locator`。

---

## 五、两个值得一提的技术点

### 薪资字体加密

某招聘网站把数字替换成 Unicode 私有区码点（`U+E000`–`U+F8FF`），再用自定义字体渲染成数字字形。`textContent` 读出来必然是乱码，因为它在字符层面就不是数字。

解法是：**既然字体能渲染，那就让浏览器渲染一遍，跟真数字做像素比对。** 用 canvas 分别渲染 PUA 字符和 0-9，取 alpha 通道二值化后逐像素算相似度，超过阈值就认定。`SIZE=64` 的位图比对是毫秒级的，不需要引入任何 OCR 依赖。

### 把"随意执行 JS"关进笼子

早期主进程直接往页面塞 JS 字符串，既是注入面，又难维护。一期重构收敛成一套结构化指令集：

```ts
type SafeCommand =
  | { cmd: 'extract';      selector: string; attr?: 'text' | 'value' | ... }
  | { cmd: 'fill';         selector: string; value: string }
  | { cmd: 'click';        selector: string }
  | { cmd: 'smartClick';   text: string; role?: 'button' }
  | { cmd: 'wait';         condition: 'load' | 'networkidle' | 'timeout' }
```

`value` 只作为**数据**传给 Locator API，不参与字符串拼接，天然防注入。

顺带一个性能收益：逐字段查询在 45 张卡片 × 6 字段的场景下是 270 次 DOM 查询，实测要 **5 分钟**；改成单次批量提取后是**毫秒级**。

---

## 六、方法论：先测量，再修复

回头看，这个项目里真正提效的不是某个技术点，而是这套做事顺序：

```
① 写最小探针，把真实响应打出来（不猜）
        ↓
② 用对照实验确认真相（守卫前 SERVICE DETECTED / 守卫后 BLOCKED）
        ↓
③ 确认了再动手重构
        ↓
④ 留一个可复跑的脚本，防止浏览器版本漂移
```

每个坑都对应 `scripts/` 下一个可复跑的探针：ws 握手可行性、桥全链路、端口守卫对照、webdriver 实测、标签页存活表现、CDP 现状诊断。

**这个习惯救了我两次**——一次发现 Chrome 150 的 403，一次发现注入补丁完全无效。两次都是先测后改。

---

## 七、五条结论

**1. 优先"借用真实环境"，而不是"伪造环境"。**
最好的伪装不是更逼真的假指纹，而是根本不需要伪装。我们砍掉了两版 profile 复制/新建方案——它们本质上都是"再造一个浏览器让站点来检测"。

**2. 先搞清楚对手在检测什么，再写代码。**
我们一度把大量精力投入 `webdriver` 伪装，而实测证明它既改不了、也不是检测点。

**3. 所有 CDP 调用都必须有界。**
连接要有超时，重连要串行退避，底层输入 API 要替换，连截图都要带超时。

**4. 能用有语义的 API，就不要用裸操作。**
`locator` 自带自动等待与可重试，裸操作只会堵死队列。

**5. 把"停止"和"取证"当成一等公民。**
所有等待走可中断的分片 sleep（500ms 检查一次取消信号），否则点了停止任务还在跑；
出问题时用环形缓冲记录最近操作并加密导出——这决定了工具是"能用"还是"敢用"。
