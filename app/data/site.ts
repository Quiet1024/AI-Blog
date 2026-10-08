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
  // 站点地址。**只在本地开发时用作回退值**（`nuxt dev` 时决定 canonical / OG / RSS）。
  //
  // 两个部署环境都靠环境变量覆盖它，不会读到这里：
  //   · GitHub Pages → CI 里注入 NUXT_PUBLIC_SITE_URL（workflow 的「计算 baseURL」步骤）
  //   · Vercel      → 在项目 Settings → Environment Variables 里配
  // 所以这个值不影响线上产物，但**本地调试时指向哪里就是它**。
  //
  // ⚠️ 换域名时记得同步改这里，否则本地跑出来的 canonical 会指向旧域名，
  //    容易误判成「线上 SEO 配置错了」。
  url: 'https://quiet1024.vercel.app', // TODO: 换成你的域名
  // 旧的 GitHub Pages 地址（保留备查，迁移完成后可删）：
  //   https://quiet1024.github.io/AI-Blog
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
    // 加密专区：私密笔记，需密码解锁。
    // 这是「完全隐藏」策略下的唯一入口 —— 不出现在首页/文章列表/标签云/
    // 搜索/RSS/sitemap 里，只有导航这一条路能进。
    { label: '加密', to: '/vault' },
  ],
  // icon 取值见 app/components/AppIcon.vue 的映射表
  social: [
     { label: 'GitHub', icon: 'github', to: 'https://github.com/Quiet1024' },
    { label: 'Gitee', icon: 'gitee', to: 'https://gitee.com/Healerd' },
    { label: 'RSS', icon: 'rss', to: '/rss.xml' },
  ],
}

export type SiteConfig = typeof siteConfig
