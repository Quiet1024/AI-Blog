# SEO 诊断报告 · 未定义空间 / AI-Blog

- **审计对象**：https://quiet1024.github.io/AI-Blog/
- **审计时间**：2026-09-30
- **代码版本**：本地 `main` @ `bb0a949`（2026-09-27）—— **落后远端 6 个提交**，线上已是 `ea0121b`（2026-09-29）
- **方法**：线上实测（多爬虫 UA 请求 / 状态码 / 响应头 / sitemap / RSS）+ 构建产物与源码核对 + GitHub API
- **原始证据**：同目录 `.seo-audit/`（可删）

---

## 一、结论先行

**1. 你的 SEO 基础做得不差。** 该有的基本都在：HTML 是预渲染的（正文在源码里，不依赖 JS）、title / description / canonical / og / robots 全套、sitemap（带 `lastmod` 和图片）、RSS、Schema.org、`.nojekyll` 关掉 Jekyll、`/admin/` 正确 `noindex`。**这不是"SEO 没做"的问题**，别去重写 meta。

**2. 搜不到的根本原因不在页面里，在"站点位置 + 年龄 + 零外链"。** 仓库 `2026-09-22` 创建，到今天 **8 天**；`0 star / 0 fork`；仓库 `homepage` 字段是空的；全网没有一条外链指向它。搜索引擎**连发现它的路径都没有**。

**3. 百度这条路是被制度性挡住的，不是技术问题。** 实测百度蜘蛛能正常抓你的页面（200），但百度搜索资源平台只接受**域名 / 子域名**级站点、要求验证文件放在**域名根目录**、且国内站点通常要求 **ICP 备案**。你的站点是 `quiet1024.github.io` 这个**共享域名下的一个子目录**，根目录不属于你（实测根 `robots.txt` 返回 GitHub 的 "There isn't a GitHub Pages site here"），**所以站点验证这一步就走不完 → 无法提交 sitemap → 无法主动推送**。

---

## 二、实测数据

### 1. 爬虫抓得到吗？—— 抓得到（UA 实测）

对文章页 `…/blog/vscode-extensions-i-keep/` 逐个换 UA 请求：

| UA | 结果 |
| --- | --- |
| Baiduspider | 200 · 43828 字节 |
| Baiduspider-render | 200 · 43828 字节 |
| Googlebot | 200 · 43828 字节 |
| Bingbot | 200 · 43828 字节 |
| SogouSpider | 200 · 43828 字节 |
| 360Spider | 200 · 43828 字节 |
| Chrome（人类） | 200 · 43828 字节 |

> ⚠️ 网上「GitHub 屏蔽百度蜘蛛、直接返回 403」的说法是 2018 年前后的旧结论，**现在不成立**。照抄那批教程会让你去装 Nginx 反代、Coding 镜像，全是白费功夫。
>
> 另外确认：正文真的在 HTML 里（预渲染生效），拿到的是完整文章而不是空壳 —— 这对百度这种 JS 渲染能力弱的引擎很关键。

### 2. robots.txt —— 全站没有

| 请求 | 结果 |
| --- | --- |
| `https://quiet1024.github.io/AI-Blog/robots.txt` | **404** |
| `https://quiet1024.github.io/robots.txt` | GitHub 的「There isn't a GitHub Pages site here」页面 |

根因在 `nuxt.config.ts`：

```ts
robots: { robotsTxt: baseURL === '/' }
```

CI 注入 `NUXT_APP_BASE_URL=/AI-Blog/` 时，这个条件为假 → **不生成 robots.txt**。（本地不带 baseURL 构建时是会生成的，`.output/public/robots.txt` 就存在。）

但要清醒：**即使生成了，放在 `/AI-Blog/robots.txt` 对爬虫也没用**——robots.txt 只认域名根。这是子路径部署的必然结果，不是配置写错了。

### 3. sitemap 里的 URL 全部 301 —— 9 / 9

sitemap 写的是不带尾斜杠的地址，实际访问全部 301 跳转：

| sitemap 里的 URL | 状态 |
| --- | --- |
| `/AI-Blog` | 301 → `/AI-Blog/` |
| `/about` | 301 → `/about/` |
| `/blog` | 301 → `/blog/` |
| `/projects` | 301 → `/projects/` |
| `/tags` | 301 → `/tags/` |
| `/blog/vscode-extensions-i-keep` | 301 → `…/` |
| `/tags/AI` | 301 → `/tags/AI/` |
| `/rss.xml` · `/sitemap.xml` · `/search-index.json` | 200（静态文件正常） |

影响：sitemap 声明的不是最终地址，每次抓取白跳一次。**这不是"搜不到"的原因**，属于该修的细节。

### 4. 结构化数据 —— 类型用错了

- 首页和文章页输出的都是 `WebPage` + `WebSite`，**没有 `BlogPosting` / `Article`**。
- 文章页那个 `WebPage` 节点的 `description` 填的是**全站简介**（"一个关于全栈开发 与 AI 工具产品的独立博客…"），而不是文章自己的摘要 —— 等于每篇文章都在对搜索引擎错误地自我介绍。
- 没有 `BreadcrumbList`。

### 5. 仓库侧（GitHub API）

| 字段 | 值 |
| --- | --- |
| created | 2026-09-22T13:06:56Z（8 天前） |
| pushed | 2026-09-29T07:23:03Z |
| stars / forks | 0 / 0 |
| homepage | **空** |
| topics | **空** |
| description | `AI Blog` |

### 6. 线上内容与本地不一致

线上 sitemap 里有两条本地仓库找不到的内容：

- `/blog/ai` —— 一篇 CMS 生成的文章，标题「ai灵犀工作台」，**description 只有 8 个字**（"作品AI灵犀平台展示。"）
- `public/uploads/1790484100787.png` —— CMS 上传的媒体目录

对应远端提交：`e03ccf1 Create 作品 "ecc8059f64c4"`、`804bae5 Create 文章 "ai灵犀工作台"`。**核对线上问题前先 `git fetch`**，否则会拿旧代码去解释线上的现象（我第一次就差点这么做）。

---

## 三、为什么百度搜不到（按影响力排序）

### 1. 站点所有权无法验证 → 收录链路根本没打开（硬阻塞）

百度搜索资源平台「添加网站」只接受**域名 / 子域名**，不接受子目录（官方填写规范明确"不能填带路径的地址"）。你要提交只可能是 `quiet1024.github.io` —— GitHub 给所有用户的共享域名。而验证方式：

| 验证方式 | 你能用吗 |
| --- | --- |
| 文件验证（放域名根目录） | ❌ 根目录不是你的仓库，放不进去 |
| HTML 标签验证（首页 `<head>`） | ❌ 校验的是域名根首页，那页不存在 |
| CNAME 验证（改 DNS） | ❌ 你没有该域名的 DNS 控制权 |
| 分目录验证 | ❌ 前置条件是**整站已验证**，死循环 |

**结论：只要还在 `<user>.github.io/<repo>/` 这个位置，百度收录这条路就是关着的**，跟你 meta 写得好不好完全无关。

### 2. 无 ICP 备案 + 共享域名的天然弱势

`.github.io` 属于共享基础设施类二级域，百度对这类域名的信任起步就很低；国内站点在百度生态里的正常玩法（备案 → 验证 → 提交 → 推送）你一样都走不了。

### 3. 站点只有 8 天，且零外链

搜索引擎发现新站只有三条路：**外链 / sitemap 提交 / 主动推送**。你三条都是断的：
- 外链 0 条（仓库自身 0 star、homepage 空）
- sitemap 提交不了（百度）/ 没提交（Google、Bing）
- 主动推送没有（没验证过站点）

### 4. 内容规模与选题

线上 9 篇。而且标题是创意型表达——「为什么我又把博客重写了一遍」「设计师写代码」——**这是给人读的标题，不是给人搜的**。没有任何人会去搜索这些词组。

---

## 四、为什么 Google / Bing 也搜不到

同样的第 3、4 条原因（新站 + 零外链 + 没提交），但**技术上没有任何阻塞**。区别在于：

> Google Search Console 和 Bing Webmaster Tools 都支持 **"网址前缀"级验证**，可以只验证 `https://quiet1024.github.io/AI-Blog/` 这一个子目录，**不需要域名根权限**。

也就是说 **Google / Bing 这条路现在就能走通，只是你还没去提交**。而且外国引擎对新站友好得多，提交后通常几天内就会收录。

---

## 五、技术问题清单（都能直接改）

| # | 问题 | 证据 | 建议修法 | 优先级 |
| --- | --- | --- | --- | --- |
| 1 | 线上无 robots.txt | `/AI-Blog/robots.txt` 404 | 迁到自有域名后自然解决；现在别指望子路径 robots.txt | P3 |
| 2 | sitemap / canonical 输出 301 地址 | 9/9 URL 301 | 让这三处输出**带尾斜杠**的最终 URL（sitemap、`canonical`、`og:url`、RSS `<link>` 统一） | P2 |
| 3 | 文章没有 `BlogPosting` | 输出的是 `WebPage` | `nuxt-schema-org` 已装且 `defineArticle` / `defineBreadcrumb` 是自动导入的，在文章页注入即可 | P1 |
| 4 | `WebPage.description` 用了站点简介 | HTML 里逐字可见 | 改成文章自身的 `description` | P1 |
| 5 | 缺 `BreadcrumbList` | — | `defineBreadcrumb`，百度/Google 都可能出面包屑 | P2 |
| 6 | 每篇 `og:image` 都是同一张默认图 | 8 篇文章**都没配 `cover`**（走 CoverArt 自动生成封面），页面 fallback 到 `/og-default.png` | 给文章补 `cover`，或把生成的封面也输出成 og 图 | P2 |
| 7 | `<head>` 缺 RSS 自动发现 | 无 `<link rel="alternate" type="application/rss+xml">` | 加一行 | P3 |
| 8 | 域名大小写不一致 | sitemap/RSS/OG 用 `Quiet1024.github.io`（CI 从 owner 拼的），`app/data/site.ts` 是 `quiet1024` | 统一成小写 | P3 |
| 9 | RSS 静态托管后丢了 charset | 构建期路由设的是 `application/rss+xml; charset=utf-8`，线上实际 `application/xml` | 影响很小（XML 声明里有 encoding），可不修 | P4 |
| 10 | 薄内容页 | `/blog/ai` 描述 8 个字；21 个标签页里多数只挂 1 篇 | 补摘要或转草稿；标签页设 `noindex` 或只保留 ≥3 篇的标签 | P2 |
| 11 | `public/_robots.txt` 是死文件 | Nuxt 会跳过 `public/` 下 `_` 开头的文件，`.output/public/` 里没有它 | 删掉 | P4 |
| 12 | 中文文件名导致 URL 不可读 | `ai灵犀工作台.md` → `/blog/ai`（slugify 把中文全剥掉了） | 文件名用英文 slug | P2 |

---

## 六、行动清单

### A. 想被百度搜到 —— 必须换位置（唯一的路）

1. **注册一个自己的域名**（腾讯云 / 阿里云，几十块一年）。
2. **做 ICP 备案**（个人博客可以备案，通常 3–20 天）。
3. **把站点部署到国内可访问的托管**，并绑定该域名。三种选法：
   - 腾讯云 **EdgeOne Pages** / 阿里云 **OSS + CDN**（对象存储开静态网站托管）
   - **Cloudflare Pages**（免备案但国内访问一般，适合先跑起来）
   - 自己的轻量服务器 + nginx（最灵活，也最费事）
   - 你现在的 Nuxt 代码**一行都不用改**：`bun run static` 出来的 `.output/public/` 直接传上去，只把 `NUXT_PUBLIC_SITE_URL` 换成新域名、`NUXT_APP_BASE_URL` 留空即可。
4. 备案下来后：百度搜索资源平台**添加站点 → 文件验证 → 提交 sitemap → 开主动推送**。
   - 顺带把 `robots.txt` 补上（这时它在域名根，终于有用了）并在里面写 `Sitemap: https://你的域名/sitemap.xml`。

> `quiet1024.github.io/AI-Blog/` 可以继续留着当镜像，只要在页面里把 canonical 指到新域名就行。

### B. 想被 Google / Bing 搜到 —— 今天就能做（30 分钟）

1. **Google Search Console** → 添加资源 → 选「**网址前缀**」→ 填 `https://quiet1024.github.io/AI-Blog/` → 用 HTML 标签验证（meta 塞进 `nuxt.config.ts` 的 `app.head.meta` 即可）→ 提交 `sitemap.xml`。
2. **Bing Webmaster Tools** → 支持直接从 GSC 导入，一键搞定。
3. 提交完几天内就能在 Google 搜到自己的文章标题。

### C. 立刻能做、当天就产生"被发现"信号

| 动作 | 为什么有用 |
| --- | --- |
| 仓库 **homepage** 字段填上站点地址（现在空着） | 这是一个 GitHub 上的真实外链 |
| 给仓库加 **topics**（`nuxt` `blog` `vue` `tailwindcss`…） | 增加被 GitHub 生态发现的机会 |
| README 顶部放站点链接 | 同上 |
| 把文章同步到**掘金 / 知乎 / CSDN**，尾部带原文链接 | **新站最有效的外链来源**，中文技术内容这几个平台的搜索权重远高于个人博客 |

### D. 内容层（决定"能不能被搜到"和"能不能排上去"）

- **标题带关键词**：`为什么我又把博客重写了一遍` → `用 Nuxt Content v3 重写博客：我的完整选型与踩坑`。
- **提高更新频率**：搜索引擎对新站的信任是随时间 + 内容量累积的，9 篇太少。
- **标签页收敛**：21 个标签页里大部分只挂 1 篇文章，属于薄内容，会稀释抓取预算。

---

## 七、做得对的地方（别乱改）

| 项 | 说明 |
| --- | --- |
| 预渲染 | 正文真在 HTML 源码里，不依赖 JS —— 这是对中文搜索引擎最重要的一条 |
| meta 全套 | title / description / canonical / og / twitter card / `max-image-preview:large` 都齐 |
| sitemap | 带 `lastmod`，还带 `<image:image>` |
| RSS + 静态搜索索引 | 纯静态托管下功能不缺 |
| `.nojekyll` | 关掉 Jekyll，避免 `_nuxt/` 被吞 |
| canonical 小写化已修 | `seo: { canonicalLowercase: false }` —— 仓库名 `AI-Blog` 含大写，不修会指向 404 |
| `/admin/` 有 `noindex` | 后台没被误收录 |

---

## 八、我没能验证的部分

1. **两个搜索引擎的实际收录条数**：本机无法可靠查询（Bing 会忽略 `site:` 操作符，返回的是无关结果）。请以 Google Search Console / Bing Webmaster Tools 后台的「已编入索引」数据为准。
2. **是否存在外链**：没有可用的反链数据源。仓库 0 star / homepage 为空是间接证据，不排除别处有链接。
3. 上面第 2–12 条技术问题里，**修法只给了目标，没给具体 API**：`@nuxtjs/sitemap` v8 我确认过**没有** `trailingSlash` 选项，尾斜杠一致化具体怎么实现需要动手时再定方案。`nuxt-schema-org` 的 `defineArticle` / `defineBreadcrumb` 已确认存在且自动导入。
