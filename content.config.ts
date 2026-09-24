import { defineCollection, defineContentConfig, z } from '@nuxt/content'

/**
 * 内容模型：改这里就等于改全站数据结构。
 * posts    —— 博客文章（Markdown，正文可渲染）
 * projects —— 作品集条目（YAML，纯数据，用于首页/作品页展示）
 */
export default defineContentConfig({
  collections: {
    posts: defineCollection({
      type: 'page',
      source: {
        include: 'posts/**/*.md',
        prefix: '/blog',
      },
      schema: z.object({
        title: z.string(),
        description: z.string().default(''),
        date: z.date(),
        // 为什么要写成 union 而不是 z.date().optional()：
        //
        // 后台（Sveltia CMS 等）对「可选日期」留空时会写入 `updated: ''`，
        // 空字符串喂给 z.date() 会报 `Invalid date value: ""`。
        // 而 @nuxt/content 对解析失败的文件是**只 WARN、然后整个文件忽略** ——
        // 构建照样是绿的，但那篇文章从站点上直接消失，没有任何显式报错。
        // 也就是说 z.date() 这个写法会让「后台把更新日期留空」变成静默删文章。
        //
        // 放进 union 后空串被接受；同时保留 z.date() 分支，
        // 兼容 yml 里 2026-09-25 这种被 YAML 解析成 Date 的写法。
        // 本字段目前没有任何组件读取（见 app/composables/usePosts.ts 的 PostItem），
        // 所以放宽类型不影响渲染。
        updated: z.union([z.date(), z.string()]).optional(),
        tags: z.array(z.string()).default([]),
        // 封面图：填了用图，没填则由 CoverArt 组件按标签自动生成封面
        cover: z.string().optional(),
        // 封面首词：浅色轨道封面上那个大号衬线短词，建议 2–4 字。
        // 不填则回落到第一个标签 —— 标签本身就是短词，比截取标题前两个字体面得多。
        // 注意：标签命中 terminalTags（AI / 工程 / 前端 …）时走深色终端轨，本字段不参与。
        kicker: z.string().optional(),
        // 首页头条位；最多展示 1 篇（取最新的一篇 featured）
        featured: z.boolean().default(false),
        draft: z.boolean().default(false),
        // 杂志风：是否用衬线体排正文
        serif: z.boolean().default(true),
        author: z.string().optional(),
      }),
      indexes: [{ columns: ['date'] }],
    }),

    projects: defineCollection({
      type: 'data',
      source: 'projects/**/*.yml',
      schema: z.object({
        name: z.string(),
        summary: z.string(),
        role: z.string().default(''),
        year: z.string().default(''),
        stack: z.array(z.string()).default([]),
        link: z.string().optional(),
        cover: z.string().optional(),
        accent: z.string().default('teal'),
        order: z.number().default(99),
      }),
    }),
  },
})
