/**
 * 全站唯一的信息配置源头。
 * 换名字、换社交链接、换导航，只改这个文件。
 */
export const siteConfig = {
  name: '未定义空间',
  shortName: '未定义空间 / Undefined Space',
  tagline: '在未定义处，构建可能。',
  description:
    '一个关于全栈开发 与 AI 工具产品的独立博客。写点文章，贴点作品。',
  url: 'https://quiet1024.github.io/AI-Blog', // TODO: 换成你的域名，SEO / RSS / OG 图都依赖它
  locale: 'zh-CN',
  author: {
    name: 'L',
    bio: '独立开发者 / 全栈开发。把复杂的东西做得干净。',
    avatar: '/avatar.svg', // 换成自己的图，放 public/ 下
    email: 'edgelive@yeah.net',
  },
  nav: [
    { label: '首页', to: '/' },
    { label: '文章', to: '/blog' },
    { label: '作品', to: '/projects' },
    { label: '关于', to: '/about' },
  ],
  // icon 取值见 app/components/AppIcon.vue 的映射表
  social: [
     { label: 'GitHub', icon: 'github', to: 'https://github.com/Quiet1024' },
    { label: 'Gitee', icon: 'gitee', to: 'https://gitee.com/Healerd' },
    { label: 'RSS', icon: 'rss', to: '/rss.xml' },
  ],
  /**
   * 右下角 AI 聊天窗（n8n Chat）。
   *
   * 留空字符串 = 功能整体关闭：组件不渲染、不发任何请求，对站点零影响。
   *
   * 地址必须是 Chat Trigger 节点里的 **Chat URL**，形如：
   *   http://localhost:5678/webhook/<webhookId>/chat      ← 本地联调
   *   https://<你的 n8n 域名>/webhook/<webhookId>/chat     ← 线上
   *
   * ⚠️ 三个容易填错/踩空的点：
   *   1. webhookId ≠ workflow id。浏览器地址栏那条 /workflow/<id> 是 n8n 的编辑器界面，
   *      不是接口地址；填进去只会「气泡出现、但发消息没反应」。
   *   2. 节点里要先打开 **Make Chat Publicly Available**（默认关闭）——
   *      关闭状态下公开 webhook 根本不注册，而且 Chat URL 那一栏在界面上是**隐藏**的。
   *   3. 改完必须**重启 dev server**：nuxt.config 只在启动时读一次这个值，热更新不生效。
   *
   * ⚠️ 本地联调填 localhost 可以（loopback 不受混合内容限制，见 N8N-CHAT.md 3.1），
   *    但**提交前务必清空**，否则线上站点会去调访客自己的 localhost。
   *
   * 更稳的做法：本地值放 `.env` 的 NUXT_PUBLIC_N8N_CHAT_URL（该文件已被 .gitignore 忽略），
   * 这个文件留空 —— 就不会有把 localhost 提交上去的风险。
   */
  chat: {
    // 这里**保持空字符串**是刻意的。
    // 本地联调请用 .env 的 NUXT_PUBLIC_N8N_CHAT_URL（.env 已被 gitignore），
    // 线上若 n8n 已公网可达，也建议在 CI 构建时注入同名环境变量。
    // 详见上方注释与仓库根目录 N8N-CHAT.md 第二节。
    n8nWebhookUrl: '',
  },
}

export type SiteConfig = typeof siteConfig
