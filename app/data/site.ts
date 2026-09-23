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
}

export type SiteConfig = typeof siteConfig
