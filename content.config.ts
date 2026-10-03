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
        // ── slug：前台 URL 的最后一段 ────────────────────────────────────
        //
        // ⚠️⚠️ 先说结论：**这个字段对 URL 没有任何控制力，纯属声明性质。**
        //     实测核对过 @nuxt/content 3.16 的 dist/module.mjs：
        //     全文搜索 `slug` 只命中两处 —— `import slugify` 与
        //     `generatePath` 内部调用 slugify，**没有任何地方读取文件的 slug 字段**。
        //     也就是说 path 完全由「文件名」经下面这条链路推导，frontmatter
        //     里手写 `slug: xxx` 会被直接忽略：
        //
        //       path = '/' + slugify(refineUrlPart(文件名 stem))   // 见 path-meta transformer
        //
        //     而 slugify 会**丢掉全部非 ASCII 字符**（中文全部消失），于是：
        //       ai灵犀工作台.md      → /blog/ai
        //       c盘爆了？？别慌….md  → /blog/c
        //     两篇撞上同一个 path 时互相覆盖 →
        //     「新建文章保存后封面变了，点进去却是上一篇的内容」。
        //
        // ✅ 所以要改 URL，**只有两条路**：
        //    ① 改文件名（唯一手段，本仓库就是这么修的：三篇文章已改 ASCII 名）；
        //    ② 在 public/admin/config.yml 给 collection 配 slug 模板，
        //       让 CMS 以后**生成 ASCII 文件名**（不是写进 frontmatter）。
        //    另见 scripts/check-content-filenames.mjs（构建期拦中文文件名）。
        //
        // 那这里为什么还留着这个字段？只为两件事：
        //   ① 让 schema 显式、能在编辑器里被看到；
        //   ② 万一将来 Content 版本支持从 frontmatter 读 slug，能少改一处。
        // 除此之外不要指望它 —— 名字容易让人误解，故写此长注释。
        slug: z.string().optional(),
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

    /**
     * 加密专区（vault）—— 私密笔记，**内容以密文入库**。
     *
     * 数据流：
     *   vault-src/*.md  （明文，.gitignore 忽略，只在本机）
     *       ↓ node scripts/vault.mjs lock
     *   content/vault/*.json  （密文 JSON，提交进仓库）
     *       ↓ 构建期被 Content 索引
     *   /vault 页面 → 前端输入密码 → SubtleCrypto 解密 → 渲染正文
     *
     * ⚠️ 为什么扩展名是 .json 而不是 .enc：
     *    @nuxt/content 只认 .md/.yml/.yaml/.json/.csv 等固定后缀，
     *    遇到 .enc 会直接报 `Error: .enc files are not supported` 并忽略该文件。
     *    我们的密文本体就是一个 JSON 对象，用 .json 既合规又语义正确。
     *
     * ⚠️ 三点必须知道的边界：
     *
     * ① 这里索引进来的**正文（data 字段）仍是密文**，服务端/构建期都解不开，
     *    只有浏览器里输入正确密码才能还原。这就是「源文件也是加密的」。
     *
     * ② meta（标题/日期/标签）是**明文**的 —— 为的是解锁前能列出条目。
     *    所以标题本身敏感的话，别把它写进 meta（或改 vault.mjs 的加密范围）。
     *
     * ③ 这个集合**绝不能被公开数据源读到**。下列位置必须显式排除 vault：
     *    · app/composables/usePosts.ts —— 只查 posts / projects，天然不含 vault
     *    · server/routes/search-index.json.get.ts / api/search.get.ts —— 搜索索引
     *    · server/routes/rss.xml.get.ts —— RSS
     *    · server/utils/sitemap-subpath.mjs —— sitemap
     *    新增数据源时请一并检查，别把 meta 漏出去。
     */
    vault: defineCollection({
      type: 'data',
      source: {
        include: 'vault/**/*.json',
        // 注意别再写 prefix: '/vault' —— 那会让 stem 变成 'vault/vault/xxx.json'
        // （content 目录下的 vault/ 已经贡献了一段）。这里不设 prefix，
        // 页面用 id 定位条目，不依赖 path。
        prefix: '',
      },
      schema: z.object({
        // 格式版本
        v: z.number(),
        // 密钥派生算法标识
        kdf: z.string(),
        // PBKDF2 迭代次数（写在文件里，便于将来调参后仍能解旧文件）
        iter: z.number(),
        // 以下三项解密必需，缺一不可
        salt: z.string(),
        iv: z.string(),
        data: z.string(),
        // ── 明文元信息（仅用于解锁前的列表展示）──────────────────────
        // ⚠️ 刻意**摊平在顶层**，不收进嵌套对象：@nuxt/content 处理 data 集合
        //    的 JSON 时会把未声明的嵌套对象整个丢掉（实测 meta 变成 `{}`），
        //    所以这里必须一级平铺。详见 shared/vault-crypto.mjs 的头部注释。
        title: z.string().default('未命名'),
        date: z.string().default(''),
        tags: z.array(z.string()).default([]),
        // 加密时记下的原始明文文件名，unlock 时用于精确还原
        source: z.string().default(''),
      }),
    }),
  },
})
