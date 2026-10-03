# n8n Chat 悬浮聊天窗

右下角的 AI 聊天助手。基于 n8n 官方的 [`@n8n/chat`](https://www.npmjs.com/package/@n8n/chat)
嵌入式组件，问答逻辑全部跑在你自己的 n8n workflow 里。

**当前状态：未启用**（`app/data/site.ts` 里 `chat.n8nWebhookUrl` 是空字符串）。
留空时组件完全不渲染、不发任何请求，对站点零影响。填上地址才会亮起来。

---

## 一、为什么挂在 layout 里，而不是 `app.head`

官方示例给的是「把 `<link>` + `<script type="module">` 丢进 HTML」。照做最简单，
但对这个博客是错的。我实测了这个包的产物体积：

| 文件 | 原始 | brotli 后 |
|---|---|---|
| `dist/chat.bundle.es.js` | **1 694 891 B（1.65 MB）** | **437 KB** |
| `dist/style.css` | 34 312 B | 6 KB |
| **合计** | **约 1.69 MB** | **约 443 KB** |

**443 KB 比整站其他资源加起来还大。** 写进 `app.head` 意味着每个页面首屏都要拉它，
LCP 直接毁掉 —— 而 SEO 是这个站点刚花了一整轮审计在优化的东西。

所以采用的方式是：

| 位置 | 效果 | 结论 |
|---|---|---|
| ❌ `nuxt.config.ts` 的 `app.head.script` | 全站首屏 SSR 进 HTML，每页必拉 443 KB | 否决 |
| ❌ `app.vue` 里 `useHead()` | 同上，只是换个文件写 | 否决 |
| ✅ `app/layouts/default.vue` + `<ChatWidget />` | 只在客户端「空闲时」加载 | **采用** |

`ChatWidget.vue` 内部用 `requestIdleCallback`（带 4 秒 `timeout` 兜底，
Safari 老版本退化为 `setTimeout 2500`），等首屏渲染完、浏览器闲下来才注入
CSS 和 JS 产物。**首屏 0 成本，气泡稍后出现**——对博客这种场景是合适的取舍。

组件放在 `app/layouts/default.vue` 而不是每个页面里，所以全站页面都会有
（含 404 页），且只有一处维护点。

### 资源自托管，不走 CDN

官方示例写的是不带版本号的 `https://cdn.jsdelivr.net/npm/@n8n/chat/dist/...` ——
jsdelivr 会把它解析到 `latest`，等于把线上站点绑在一个随时会变的上游上。

更关键的是：**这条 CDN 在国内网络下不可靠。** 实测浏览器直接报
`net::ERR_CERT_AUTHORITY_INVALID`（DNS 污染 / 中间人证书），
属于**运行时不可控**的第三方依赖 —— 访客的浏览器拉不到，聊天入口就是打不开。

所以产物已经取回仓库，由本站同源提供：

| 文件 | 位置 | 大小 |
|---|---|---|
| `chat.bundle.umd.js` | `public/vendor/n8n-chat/` | 1 624 923 B |
| `style.css` | `public/vendor/n8n-chat/` | 34 312 B |

版本 `@n8n/chat` **1.40.3**，**逐字节原样复制、未做任何修改**，
并附上 `LICENSE.md`（该包用 n8n 的 Sustainable Use License，
其 Notices 条款要求随附许可证全文）。
升级步骤、SHA-256 校验清单都在 → `public/vendor/n8n-chat/README.md`。

> **为什么用 UMD 版，而不是官方示例里的 ESM 版？**
> 因为 `chat.bundle.es.js` **不是自包含的**。实测它的依赖：
> 静态 import `vue.runtime.esm-bundler-*.mjs` / `en-*.mjs`，动态 import `node-icons-*.mjs`。
> 自托管 ESM 版就得连带整个依赖闭包（`emojiData-*.mjs`、`lucideIconData-*.mjs`
> 等带 hash 的分片，合计 6 MB+），还要额外处理 `.mjs` 在静态托管上的 MIME 类型问题。
> 而 `chat.bundle.umd.js` 是**单文件**：零 `require()`、零动态 import、零 `.mjs` 引用，
> 加载后直接暴露 `window.N8nChat`，用 `.js` 扩展名也没有 MIME 问题。

对应到组件里，就是两个常量 + 一次经典 `<script>` 注入
（用 `useBasePath()` 拼 `app.baseURL`，否则子路径部署会指向域名根而 404）。

---

## 二、启用步骤

### 1. n8n 侧

1. 建一个 workflow，用 **Chat Trigger** 节点作为入口
2. （建议，非必需）在 **Allowed Origins (CORS)** 里把默认的 `*` 改成：
   ```
   https://quiet1024.github.io
   ```
   ⚠️ **默认值就是 `*`（放行所有来源），不配也能跑通** —— 这不是功能必需项。
   收紧只是为了防止别人把 widget 嵌到自己页面蹭你的 LLM 额度；
   它**拦不住 `curl`**，别当成安全边界。
   本地联调时若要一起配，写成 `http://localhost:3000,https://quiet1024.github.io`。
3. 想要逐字流式输出，就把 Chat Trigger 的响应模式设为 **Streaming response**
4. 打开 Chat Trigger 的 **Make Chat Publicly Available**
   （默认关闭。**关闭时 Chat URL 那一栏在界面上是隐藏的** —— 这就是「找不到地址」的原因）
5. **把 workflow 切成 Active**（未激活的 workflow 不响应 webhook，production 地址会 404）
6. 复制 Chat Trigger 给的 **Chat URL**，形如：
   ```
   https://<你的 n8n 域名>/webhook/<webhookId>/chat
   ```
   ⚠️ 三个细节，任何一个错了都会失败：
   - **结尾的 `/chat` 不能丢** —— Chat Trigger 的聊天入口就挂在那个后缀上
   - 用 **production** 地址，不要用 test 地址 —— test 地址只在点
     「Listen for test event」时短暂有效
   - 这里的是 **webhookId**，**和浏览器地址栏里的 workflow id 不是一回事**。
     所以「把编辑器地址里的那串 id 抠出来拼一拼」是行不通的。
     反过来，**误填编辑器地址的症状非常好认**：气泡在、但没有输入框（见第五节）。

### 2. 站点侧

**正式启用**只改 `app/data/site.ts` 一处：

```ts
chat: {
  n8nWebhookUrl: 'https://<你的 n8n 域名>/webhook/<uuid>',
},
```

**本地联调别改这个文件** —— 用 `.env`，否则容易把 `localhost` 一路提交进仓库：

```
# .env（已在 .gitignore 里，不会入库）
NUXT_PUBLIC_N8N_CHAT_URL=http://localhost:5678/webhook/<webhookId>/chat
```

然后 `bun run dev`，开 `http://localhost:3000/` 就能看到气泡。

优先级：环境变量 `NUXT_PUBLIC_N8N_CHAT_URL` > `site.ts` 里的值（见 `nuxt.config.ts`）。

⚠️ 站点是**纯静态部署**，`runtimeConfig.public` 的值在**构建时**就被写进产物了。
所以线上要用环境变量的话，必须在 **CI 构建那一步**注入；只在服务器上设是没用的
（静态站没有运行时服务器）。不确定就走 `site.ts`，最直观。

然后 `bun run static` 或直接 push 触发 Actions。

⚠️ **仓库会因此多出约 1.66 MB**（`public/vendor/n8n-chat/`）。这是自托管的必然代价，
换来的是「不依赖第三方 CDN」。项目里已有同类先例（`public/admin/sveltia-cms.js` 2.18 MB），
不算破坏既有约定。

如果你更愿意走 CDN，把组件顶部的 `LIB_PATH` / `CSS_PATH` 换回
`https://cdn.jsdelivr.net/npm/@n8n/chat@1.40.3/dist/...` 即可 ——
但请先确认你的网络能稳定访问它（本机实测：会间歇性报证书错误）。

---

## 三、前置条件（本地联调 vs 线上发布，要求不一样）

### 3.1 本地可以用 http —— 不受混合内容限制

**「本地只能用 https」是个误解。** 页面 `http://localhost:3000` 配 webhook
`http://localhost:5678/webhook/xxx` **完全可行**，一条限制都碰不到。

原因：**混合内容（mixed content）只在「一边安全、一边不安全」时才成立。**

| 页面 | webhook | 结果 |
|---|---|---|
| `https://quiet1024.github.io` | `http://<公网域名>` | ❌ 被拦（blockable mixed content） |
| `http://localhost:3000` | `http://localhost:5678` | ✅ 通过 —— 两边都不安全，**不构成混合内容** |
| `https://<任意站点>` | `http://localhost:5678` | ✅ 通过 —— loopback 被视为安全来源 |

第三行反直觉，但这是规范写死的：`http://localhost` / `http://127.0.0.1`
属于 **potentially trustworthy origin**，与 https 同等对待，**即便页面本身是 https 也不拦**。
（MDN《Mixed content》原文：*"Local resources are considered to be from secure origins…
content accessed from loopback addresses such as `http://127.0.0.1/` or `http://localhost/`"*）

**本地只需要做两件事：**

1. 本地起一个 n8n（默认 `http://localhost:5678`），Chat Trigger 选 **Embedded Chat**
   并打开 **Make Chat Publicly Available**，拿到形如
   `http://localhost:5678/webhook/<uuid>/chat` 的地址
2. 地址写进 `.env`（见上一节），然后 `bun run dev`

**CORS 本地也不用配**：Chat Trigger 的 **Allowed Origin 默认就是 `*`**，放行所有来源。

> 本地想少一步、不必激活 workflow：可以先在编辑器点 **Execute workflow**，
> 用 test 地址 `http://localhost:5678/webhook-test/<webhookId>/chat` 测。
> 代价是它只在监听期间有效，且会话加载类请求可能不认这条路 ——
> 想稳定复现线上行为，还是激活 workflow 走 production 地址。
>
> 组件里 `loadPreviousSession` **已经固定为 `false`**（原因见第五节），
> 所以「启动期请求失败 → 连输入框都没有」这条坑不会再出现；
> test 地址下也能正常打出输入框，只是发消息本身仍受监听时限约束。

### 3.2 线上发布：以下三条必须满足

缺任何一个，线上都会失败，而且失败方式还挺安静：

1. **n8n 必须公网 HTTPS 可达。** ← 混合内容真正会咬人的地方在这里。
   访客看到的是 `https://quiet1024.github.io`，webhook 若是 `http://<公网域名>`，
   属于 blockable mixed content，请求被直接拦掉。
   同时它还得**真能被访客访问到** —— 这才是 `localhost` 在线上无解的原因
   （访客的浏览器连不到你的机器），跟混不混合内容无关，别把两件事混为一谈。

2. **workflow 必须是 Active，且用 production 地址**（`/webhook/...`，不是 `/webhook-test/...`）。

3. **建议：把 Allowed Origin 从默认的 `*` 收紧到自己的域名。**
   ⚠️ 这是**安全加固，不是功能必需** —— 默认 `*` 时功能是通的。
   收紧能挡掉别人把 widget 嵌到自己页面来蹭额度，
   但**挡不住 `curl`**：webhook 地址本身是公开的，真正的防线是 n8n 侧限流/鉴权。

---

## 四、界面语言与配色

### 中文文案

`@n8n/chat` 的 `defaultLanguage` **目前只支持 `en` 一个值**，没有 `zh-CN`。
唯一办法是把 `i18n.en` 里的文案整体覆盖掉 —— 组件里已经这么做了：

```ts
defaultLanguage: 'en',
i18n: {
  en: {
    title: '未定义空间',
    subtitle: '关于文章内容、技术选型，都可以问我。',
    footer: '',
    getStarted: '开始新对话',
    inputPlaceholder: '输入你的问题…',
  },
},
```

想改文案就改这里，不要试图加 `zh` 键（不生效）。

### 配色

n8n 的 UI 全部走 `--chat--*` CSS 自定义属性，**默认是紫红色系**，
和本站 teal/amber 完全不搭。组件里已经把它映射到站点 token：主色 → `--color-accent-500`，
中性色 → `--color-ink-*`。

这样映射的好处：**换 accent 配色、切暗色模式，聊天窗会自动跟随**
（因为 `--color-accent-*` 是随 `[data-accent]` 变的）。

⚠️ 一个容易踩的坑：这些变量**不能写在 `:root` 上**。n8n 自己的样式表里也是 `:root`，
两者**同权重**，而 n8n 的 CSS 是运行时后注入的 → 后者胜出，覆盖直接失效。
所以组件把它们挂在 `#n8n-chat` 容器上 —— 自定义属性会继承给容器内所有元素，
不受注入顺序影响。

---

## 五、排查

| 现象 | 先查什么 |
|---|---|
| 气泡压根没出现 | `chat.n8nWebhookUrl` 是否有值？为空时组件完全不渲染（本地记得配 `.env`） |
| **气泡出现了，但聊天窗里没有输入框**，底部只有 `Powered by n8n` | webhook 地址不对 / n8n 没起 / workflow 没 Active。机制见下方「为什么地址填错会连输入框一起消失」 |
| 改了 webhook 地址，气泡还是没出现 | **该值在配置加载时就被求值 → 必须重启 dev server**（`Ctrl+C` 后 `bun run dev`）。改完 `site.ts` / `.env` 不重启，读到的仍是旧值 |
| 控制台报 `ERR_CERT_AUTHORITY_INVALID` | 说明在从 CDN 加载资源。自托管后不该出现 —— 除非你手动把 `LIB_PATH` / `CSS_PATH` 改回了 CDN 地址 |
| 控制台报 `资源加载失败：…/vendor/n8n-chat/…` | `public/vendor/n8n-chat/` 下的文件缺失或没部署。子路径也要对上：本地是 `/vendor/...`，线上是 `/AI-Blog/vendor/...`（组件用 `useBasePath()` 自动拼） |
| 控制台报 `createChat 未找到（资源可能损坏或被拦截）` | 脚本请求返回的不是 JS。Network 里看该请求的 Content-Type：`text/html` 说明命中了 404 页面 |
| 气泡出现了，发消息没反应 | 控制台看报错：① 报 CORS → 你是不是手动设过 Allowed Origins 白名单？把当前来源加进去（**默认 `*` 不会触发**）② workflow 没 Active、或用了已失效的 test 地址 |
| 控制台报混合内容被拦 | webhook 是**公网 `http://`** 地址 → 换 https。**`localhost` 不会触发这条**（见 3.1） |
| 控制台报「加载历史会话失败」 | 组件里 `loadPreviousSession` 已固定为 `false`，正常不会再发那次请求。若是你手动改回 `true` 后报的错，说明 n8n 侧没有能返回历史消息的 Memory 节点，改回 `false` 即可 |
| 文案还是英文 | `i18n` 只认 `en` 键，确认文案写在 `en` 里 |
| 想临时关掉 | `n8nWebhookUrl` 改成空字符串即可，不用删组件 |

> ⚠️ 一条会骗过你的：**只要 webhook 地址是非空字符串，气泡就会出现** ——
> 气泡是 `createChat()` 一调用就渲染的，跟地址对不对没关系。
> 所以「气泡出来了」≠「配好了」。

### 为什么地址填错会连输入框一起消失

这是本轮踩到的坑，值得单独记一笔 —— 它的失败方式非常不像「配置错误」。

`@n8n/chat` 1.40.3 里，聊天窗的 footer 是这么写的（反编译自 `chat.bundle.umd.js`）：

```
currentSessionId ? <Input/> : <GetStartedFooter/>
```

而 `GetStartedFooter` 的内容只有一行 **"Powered by n8n"**，没有任何输入控件。
也就是说：**输入框不是一直都在的，它挂在一个「会话已建立」的条件上。**

那会话是怎么建立的？启动顺序是关键：

```ts
// Chat 组件 onMounted
await loadPreviousSession()                                     // ① 一次 POST 请求
if (!showWelcomeScreen && !currentSessionId) startNewSession()  // ② 纯本地，生成 uuid
```

- ① 的请求体是 `{ action: 'loadPreviousSession', sessionId: '<uuid>' }`，
  打往你配的 `webhookUrl`。**它一旦抛错（连接被拒 / CORS 被拦 / 404），
  `await` 会把整个 `onMounted` 中断掉 —— ② 根本执行不到。**
- `currentSessionId` 是在 ① 的**最后一行**才被赋值的。① 挂了，它就永远是 `null`。
- 结果：footer 落到 `GetStartedFooter`，界面上只剩「Powered by n8n」。

**症状因此长这样：气泡在、点开有欢迎语、但底部没有输入框，一句话都打不出来。**
控制台里的线索只有一条「未处理的 Promise 报错」，很容易被误判成 CSS 或资源问题。

还有一个加剧问题的细节：**这个包的 fetch 包装不做 `response.ok` 校验**
（内部先 `json()`，失败就退回 `text()`）。所以地址指向 n8n 编辑器页时，
它会把整页 HTML 当成功结果吃下去、**连报错都不给**，只是历史消息为空。
换句话说「配错地址」有时报错、有时静默，两种都不好查。

**处置方式（已落地在组件里）**：把 `loadPreviousSession` 固定为 `false`。
这样 ① 直接短路返回，② 必然执行 —— 而 ② 是纯本地的（只生成 uuid 存进
`localStorage`，不发任何请求），所以**输入框必定出现，且启动不再依赖网络**。
代价仅仅是「刷新后不从 n8n 侧拉回历史消息」，多轮对话本身不受影响
（会话 id 在本地生成，随每条消息一起发给 webhook）。

> 想手动确认地址是否可用，可以在**页面自己的控制台**里打一发（必须同源页面，
> 否则测不到 CORS 这一层）：
>
> ```js
> fetch('http://localhost:5678/webhook/<webhookId>/chat', {
>   method: 'POST',
>   headers: { 'Content-Type': 'application/json' },
>   body: JSON.stringify({ action: 'loadPreviousSession', sessionId: 'probe' }),
> }).then(async (r) => console.log(r.status, r.headers.get('content-type'), await r.text()))
> ```
>
> - 返回 `application/json` → 地址是对的 ✅
> - 返回 `text/html` → 打到了编辑器页或 404 页（地址错 / workflow 没 Active）
> - 抛 `TypeError: Failed to fetch` → n8n 没起、或 CORS 没放行当前来源

---

## 六、成本与风险（值得先想清楚）

- **webhook 是公开的。** 任何知道地址的人都能调用，而每个访客的每轮对话都会消耗
  你 workflow 里的 LLM 额度。**建议在 n8n 侧加限流**，或给 Chat Trigger 加一道校验。
- **CORS 默认放行所有来源**（Allowed Origin = `*`），所以它默认不算门槛 ——
  想拿它当限制得主动去配，而且它**拦不住直接 `curl` 的人**。
- **~~依赖第三方 CDN~~ → 已消除。** 资源改为自托管（`public/vendor/n8n-chat/`），
  `cdn.jsdelivr.net` 的证书/可达性问题不再影响访客。
  代价是仓库多约 1.66 MB，且升级要手动替换文件（步骤见该目录 `README.md`）。
- **许可证不是 MIT。** `@n8n/chat` 用的是 n8n 的 **Sustainable Use License**：
  允许个人 / 非商业使用，也允许「免费、非商业目的」的分发 —— 个人博客符合。
  但其 **Notices 条款要求随附许可证全文**，所以 `LICENSE.md` 与产物放在一起了，别删。
  若这个站以后转为商业用途，需要重新评估。
- **如果以后给站点加 CSP**（比如迁到 Cloudflare Pages 用 `_headers`），
  自托管资源只需 `script-src 'self'` / `style-src 'self'`，
  另外放行你的 n8n 域名即可（`connect-src`）。
  GitHub Pages 不支持自定义响应头，所以现在没这个问题。

---

## 七、我验证到哪一步了

**产物与自托管（2026-10-02 实测）**

- ✅ **UMD 版是自包含的**（这是选它的理由）：`chat.bundle.umd.js` 零 `require()`、
  零动态 import、零 `.mjs` 引用、零 `import.meta`；UMD 包装暴露
  `globalThis.N8nChat`，且 `.createChat=` 确实存在。
- ✅ **ESM 版不自包含**（这是不用它的理由）：`chat.bundle.es.js` 静态 import
  `./vue.runtime.esm-bundler-DN_fhWP9.mjs`、`./en-BVSQYf2U-Drp34G7o.mjs`，
  动态 import `./node-icons-CaKBLFvs-VW7YPMKQ.mjs`。
- ✅ **样式不会自动注入**：整个 bundle 里 `--chat--` 只出现 1 次（一处
  `var(--chat--textarea--height)` 引用），没有内联整份样式表
  → 所以必须单独 `<link>` `style.css`。
- ✅ **字节一致性**：落地后的两个文件与 npm 包内原件 SHA-256 完全相同
  （校验表见 `public/vendor/n8n-chat/README.md`）。`style.css` 首行的
  `/*! Package version @n8n/chat@1.40.3 */` 声明因此得以保留。
- ✅ **许可证**：包内 `license` 字段是 `SEE LICENSE IN LICENSE.md`，
  正文为 Sustainable Use License —— 已把全文随附到产物目录。

**「没有输入框」根因定位（2026-10-02 实测，反编译 `chat.bundle.umd.js`）**

- ✅ **footer 是有条件的**：`Chat` 组件的渲染函数为
  `footer: [ currentSessionId ? <Input> : <GetStartedFooter> ]`；
  `GetStartedFooter` 只渲染 `i18n.footer`（我们设成空串）+ `Powered by n8n`。
- ✅ **store 初始值**：`currentSessionId = null`、`credentialStatus = null`、
  `blockUserInput = false`、`waitingForResponse = false`。
  其中 `credentialStatus` 为 `null` 时输入框**不会**被置灰 ——
  那个判断只对「嵌在 n8n 编辑器 iframe 里的预览」生效（靠 `window.parent` 的
  postMessage 更新），独立嵌入时永远是 `null`。
- ✅ **会话建立路径**：`loadPreviousSession()` 内部第一行是
  `if (!options.loadPreviousSession) return;` → 所以改 `false` 可完全短路；
  `startNewSession()` 全程本地（uuid + `localStorage`），**零网络调用**。
- ✅ **启动顺序**：`await loadPreviousSession()` 在 `startNewSession()` **之前**，
  且二者在同一个 `async` 挂载钩子里 → 前者抛错会连带跳过后者。
- ✅ **请求不做 ok 校验**：内部 `qf()` = `fetch(...)` 后 `json()`，解析失败退回
  `text()`，**没有 `response.ok` 分支** → 编辑器页 HTML 会被静默吞下。
- ⚠️ 未在真实浏览器验证：以上均来自产物静态分析。
  「footer 确实渲染成了 Powered by n8n」这一步需要点开气泡肉眼确认。

**功能与配置（更早一轮实测）**

- ✅ 产物体积：ESM 版 1 694 891 B（brotli 437 KB）、`style.css` 34 312 B。
- ✅ 配置项名称与默认值：逐条对照官方 README（`mode` / `target` /
  `loadPreviousSession` / `i18n` / `enableStreaming` 等）。
- ✅ 站点 token 名称：`--color-accent-*`、`--color-ink-*`、`--font-sans`，
  并确认 accent 是随 `[data-accent]` 属性切换的。

**没验证的（需要你第一次跑的时候确认）：**

- ❌ **没在真实浏览器里点过** —— 本沙箱跑不起 `nuxt generate`（会挂死）。
  所以「气泡位置、`position: fixed` 是否被祖先元素干扰、变量覆盖是否真的生效、
  自托管资源在子路径下是否真的 200」这几件事，请你启用后自己看一眼。
  最快的确认方式：开 DevTools 的 Network 面板，看 `chat.bundle.umd.js` 和
  `style.css` 是否都是 `200`（而不是 404）。
- ❌ 没验证过 `metadata`（把当前文章路径传给 n8n）—— 想做的话注意：
  `createChat()` 只在页面加载时创建一次，SPA 内跳转后它拿到的是**入口页**的路径，
  不是当前页。要用的话得自己监听路由变化。
