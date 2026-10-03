<script setup lang="ts">
/**
 * n8n Chat 悬浮聊天窗 —— 可选功能，**默认关闭**。
 *
 * 为什么单独做成组件、而不是写进 nuxt.config.ts 的 app.head？
 * n8n 的产物实测 **1.62 MB JS + 34 KB CSS**，比整站其他资源加起来还大。
 * 一旦挂到 app.head，**每个页面首屏都要拉它**，直接拖垮 LCP。
 * 所以这里改成「空闲时懒加载」：首屏渲染完、浏览器闲下来才注入。
 *
 * 资源**自托管**，不走 CDN —— 原因与升级步骤见：
 *   public/vendor/n8n-chat/README.md
 * 一句话：cdn.jsdelivr.net 在国内网络下会报 net::ERR_CERT_AUTHORITY_INVALID，
 * 属于运行时不可控的第三方依赖；改成本站同源文件后这条风险消失。
 *
 * 启用方式：
 *   线上 —— 填 app/data/site.ts 的 chat.n8nWebhookUrl，
 *           或在 CI 构建时注入 NUXT_PUBLIC_N8N_CHAT_URL
 *   本地 —— 写 .env：NUXT_PUBLIC_N8N_CHAT_URL=http://localhost:5678/webhook/<id>/chat
 *           （.env 已在 .gitignore 里；别把 localhost 写进 site.ts）
 *           改完这个值**必须重启 dev server** —— 它在配置加载时就定死了。
 * 留空 → 组件不渲染、不发任何请求，对站点零影响。
 *
 * 前置条件（详见仓库根目录 N8N-CHAT.md 第三节）：
 *   本地联调：页面 http://localhost:3000 配 http://localhost:5678/webhook/... 即可，
 *             不受混合内容限制（loopback 被视为安全来源，与 https 同等对待）。
 *   线上发布：1. n8n 必须公网 HTTPS 可达（本站是 https，公网 http 会被按混合内容拦掉）
 *             2. workflow 必须是 Active，且用 production 地址（不是 test 地址）
 *             3. 建议把 Allowed Origins 从默认的 * 收紧到 https://quiet1024.github.io
 *
 * ⚠️ 只要 webhookUrl 是非空字符串，气泡就会出现（它只在发消息时才被用到）。
 *    所以「气泡出来了」≠「配好了」。
 */

/**
 * 自托管资源（版本号同步维护在 public/vendor/n8n-chat/README.md）。
 * 用 UMD 单文件、经典 <script> 加载，而不是 ESM import()：
 * 官方 dist 里的 chat.bundle.es.js **不是自包含的**，它静态 import
 * vue.runtime.esm-bundler-*.mjs / en-*.mjs、动态 import node-icons-*.mjs；
 * 而 chat.bundle.umd.js 零 require、零动态 import，加载后直接暴露 window.N8nChat。
 */
const LIB_PATH = '/vendor/n8n-chat/chat.bundle.umd.js'
const CSS_PATH = '/vendor/n8n-chat/style.css'

const {
  public: { n8nChatUrl },
} = useRuntimeConfig()

// 拼 app.baseURL：本站部署在子路径 /AI-Blog/，写死的 '/vendor/...' 会指向域名根而 404
const withBase = useBasePath()

const enabled = computed(() => Boolean(String(n8nChatUrl ?? '').trim()))

let booted = false
let libPromise: Promise<void> | null = null

function ensureCss() {
  if (document.querySelector('link[data-n8n-chat]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = withBase(CSS_PATH)
  link.dataset.n8nChat = 'true'
  document.head.appendChild(link)
}

function loadLib(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = withBase(LIB_PATH)
    script.async = true
    script.dataset.n8nChat = 'true'
    script.onload = () => resolve()
    script.onerror = () =>
      reject(new Error(`资源加载失败：${withBase(LIB_PATH)}（文件是否已提交？）`))
    document.head.appendChild(script)
  })
}

async function boot() {
  const root = document.getElementById('n8n-chat')
  // root 已有子节点 = 之前已经创建过（dev 下 HMR 可能重复触发 onMounted）
  if (booted || !enabled.value || !root || root.childElementCount > 0) return
  booted = true

  ensureCss()

  try {
    // 经典 <script> 的 onload 与「全局是否真的挂上了」是两件事，这里显式校验
    const existing = (window as any).N8nChat
    if (typeof existing?.createChat !== 'function') {
      if (!libPromise) libPromise = loadLib()
      await libPromise
    }

    const mod = (window as any).N8nChat
    if (typeof mod?.createChat !== 'function') {
      throw new Error('window.N8nChat.createChat 未找到（资源可能损坏或被拦截）')
    }

    mod.createChat({
      webhookUrl: n8nChatUrl,
      // 挂到我们自己的容器上（默认为 '#n8n-chat'，这里显式写出来更清楚）
      target: '#n8n-chat',
      // window = 右下角气泡 + 固定尺寸窗口；fullscreen 需要容器有确定宽高，本站不合适
      mode: 'window',
      showWelcomeScreen: false,
      // ⚠️ 这个值同时决定了「聊天窗里有没有输入框」，别随手改成 true。
      //
      // 1.40.3 的启动流程（Chat 组件 onMounted，反编译自 chat.bundle.umd.js）：
      //     await loadPreviousSession()                              ← 一次网络请求
      //     if (!showWelcomeScreen && !currentSessionId) startNewSession()
      // 而它的 footer 模板是：
      //     currentSessionId ? <Input/> : <GetStartedFooter/>
      // 其中 GetStartedFooter 里只有一行 "Powered by n8n"，**没有输入框**。
      //
      // 于是：只要那次请求失败（地址写错 / n8n 没起 / CORS 被拦），await 就抛错，
      // 后面的 startNewSession() 根本执行不到 → currentSessionId 一直是 null
      // → 底部渲染成 "Powered by n8n"，输入框凭空消失，
      //   而控制台只留一条未处理的 Promise 报错，极难定位到根因。
      //
      // 更坑的是这个包**不做 response.ok 校验**（内部 fetch 包装只 `json()` 失败后
      // 退回 `text()`）：地址指向 n8n 编辑器页时，它会把整页 HTML 当成功结果吃掉，
      // 连报错都没有，只是历史消息为空。
      //
      // 改成 false 后，startNewSession() 是**纯本地**的 —— 只生成一个 uuid 写进
      // localStorage，不发任何请求 —— 所以输入框必然出现，启动也不再依赖网络。
      // 代价：刷新页面后不向 n8n 拉回历史消息（本来也需要 n8n 侧配了 Memory 节点）。
      // 多轮对话本身不受影响：会话 id 在本地生成，并随每条消息一起发给 webhook。
      loadPreviousSession: false,
      // ⚠️ 官方只支持 en 这一个语言键。
      // 想显示中文，就得把 en 里的文案全部覆盖掉 —— 这是目前唯一的办法。
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
      initialMessages: [
        '你好，我是这个博客的 AI 助手。',
        '可以问我文章里的技术细节，或者聊聊你正在做的东西。',
      ],
    })
  } catch (err) {
    // 失败就恢复标记，让下次交互还能重试，而不是永久哑掉
    booted = false
    libPromise = null
    console.error('[n8n-chat] 加载失败（不影响页面其他功能）：', err)
  }
}

onMounted(() => {
  if (!enabled.value) return
  if ('requestIdleCallback' in window) {
    // timeout 兜底：即便浏览器一直不空闲，4 秒后也把它排上
    ;(window as any).requestIdleCallback(() => boot(), { timeout: 4000 })
  } else {
    // Safari 老版本没有 requestIdleCallback
    window.setTimeout(boot, 2500)
  }
})
</script>

<template>
  <!-- n8n 会往这个容器里放气泡按钮和聊天窗口；留空 URL 时整个节点不渲染 -->
  <div v-if="enabled" id="n8n-chat" />
</template>

<style>
/*
 * n8n 的配色全部走 --chat--* 自定义属性，默认是紫色系（--chat--color--primary:#e74266），
 * 和本站 teal/amber 完全不搭。
 * 这里把变量挂在 #n8n-chat 上（而不是 :root）有两个原因：
 *   1. 自定义属性是继承的，挂在容器上，容器内所有元素自然生效；
 *   2. 如果写在 :root，会和 n8n 自己样式表里的 :root 规则**同权重**，
 *      而 n8n 的 CSS 是运行时后注入的 → 后者胜出，覆盖直接失效。
 * 映射到本站 token 后，换 accent 配色、切暗色模式都会自动跟随。
 */
#n8n-chat {
  --chat--color--primary: var(--color-accent-500);
  --chat--color--primary-shade-50: var(--color-accent-600);
  --chat--color--primary--shade-100: var(--color-accent-700);
  --chat--color--secondary: var(--color-accent-500);
  --chat--color-secondary-shade-50: var(--color-accent-600);
  --chat--color-dark: var(--color-ink-900);
  --chat--color-light: var(--color-ink-50);
  --chat--color-light-shade-50: var(--color-ink-100);
  --chat--color-light-shade-100: var(--color-ink-200);
  --chat--color-medium: var(--color-ink-300);
  --chat--color-disabled: var(--color-ink-300);
  --chat--font-family: var(--font-sans);
  --chat--border-radius: 0.5rem;
  --chat--window--border-radius: 0.75rem;
  --chat--window--border: 1px solid var(--hairline);
  --chat--toggle--size: 52px;
  --chat--toggle--background: var(--color-accent-500);
  --chat--toggle--hover--background: var(--color-accent-600);
  --chat--toggle--active--background: var(--color-accent-700);
  --chat--header--background: var(--color-accent-600);
  --chat--message--user--background: var(--color-accent-500);
}

/* 暗色模式：纸感浅底换成墨色，避免夜里弹出一块刺眼的白 */
.dark #n8n-chat {
  --chat--color-white: #1a1917;
  --chat--color-light: #171614;
  --chat--color-light-shade-50: #22211e;
  --chat--color-light-shade-100: #2c2a26;
  --chat--color-medium: #3a3833;
  --chat--color-dark: #ece9e3;
  --chat--color-disabled: #3a3833;
  --chat--message--bot--background: #22211e;
  --chat--message--bot--color: #ece9e3;
  --chat--message--bot--border: 1px solid rgba(236, 233, 227, 0.12);
  --chat--message--user--color: #0e0e0d;
  --chat--body--background: #171614;
  --chat--footer--background: #171614;
  --chat--footer--color: #ece9e3;
  --chat--input--background: #22211e;
  --chat--input--text-color: #ece9e3;
  --chat--message--pre--background: rgba(255, 255, 255, 0.08);
}
</style>
