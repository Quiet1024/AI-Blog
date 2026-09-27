# 分支说明：feat/sveltia-cms

试 **Sveltia CMS**（纯静态内容后台）的试验分支。`main` 不受影响，线上博客照旧。

## 一句话结论

**纯静态站就能有后台，不需要任何服务器、不需要换托管。**
登录用 GitHub「令牌」(PAT)，内容改完直接提交回仓库，CI 自动重建。

这正好补上了 Nuxt Studio 的那个硬伤（Studio 要求 SSR，用不了 GitHub Pages）。

## 这个分支改了什么

**新增 4 个静态文件 + 1 处 schema 修复**（后者是为了修掉一个会静默删文章的坑，见下面 坑 0）：

| 文件 | 说明 |
|---|---|
| `public/admin/index.html` | 后台入口（1 KB） |
| `public/admin/config.yml` | 字段配置（4.6 KB）—— 改这个就是改后台表单 |
| `public/admin/sveltia-cms.js` | CMS 本体，**自托管**（2.08 MB） |
| `public/admin/chunks/react-dom.js` | 懒加载 chunk，**自托管**（215 KB） |
| `content.config.ts` | `updated` 改成 union，容忍空串（**必须改，理由见坑 0**） |
| 本文件 | 说明 |

**没有改 `nuxt.config.ts`、没有加依赖、没有构建步骤。**
`public/` 目录 Nuxt 会原样复制到产物，所以这些文件自动出现在 `/admin/` 下。

## 怎么用

### 本地看界面

```bash
bun run dev
# 打开 http://localhost:3000/admin/
```

会看到 Sveltia 的登录页（本地不需要登录就能看到界面）。

### 线上真正用起来

部署后访问 `https://<你的域名>/admin/`，点 **「Sign In with Token」**：

1. 点按钮 → 跟着弹窗里的链接去 GitHub 生成一个 token（**权限已经预选好了**）
2. 选 **Fine-grained token**，只授权给 `AI-Blog` 这一个仓库
3. 需要两个权限：`Contents` = Read and write，`Pull requests` = Read and write
4. 把 token 粘回来，登录完成

token 存在浏览器本地，下次不用再填。

**为什么这个方式好**：不用建 OAuth App、不用部署任何服务、不给第三方任何权限。
这是 Sveltia 相对 Decap/Netlify CMS 最实用的一条改进。

> 如果以后要给「不懂 GitHub 的客户」用，再考虑部署 Sveltia CMS Authenticator
> （一个 Cloudflare Worker，一次性约 20 分钟），那样就能用 GitHub 账号一键登录。
> 现阶段自己用，PAT 足够了。

## 字段配置说明

`config.yml` 里两套集合严格对齐 `content.config.ts` 的 zod schema：

| 集合 | 目录 | 格式 | 字段数 |
|---|---|---|---|
| 博客文章 | `content/posts/` | Markdown + frontmatter | 11 + 正文 |
| 作品集 | `content/projects/` | 纯 YAML | 9 |

几个刻意的选择：

- **正文用 `markdown` 而不是 `richtext`**：本项目正文含 MDC 语法（`:::` 容器、Vue 组件），
  markdown 模式原样保留，richtext 可能把它改写坏。
- **日期不指定 `format`**：Sveltia 用 Day.js（不是 moment），`datetime` 默认就输出
  ISO 的 `YYYY-MM-DD`，与现有文章的 `date: 2026-09-18` 完全一致。
  官方也建议「尽量用 ISO，格式化交给应用代码」。
- **作品配色用 `select`**：取值来自 `app/data/covers.ts` 里注册的 6 套
  （teal / amber / moss / ocean / clay / ink），避免手打出不存在的 key。
- **上传的图存 `public/uploads/`**，前台引用写成 `/uploads/xxx.png`，
  与现有 `/chatmap/xxx.png` 同一种约定。

## ⚠️ 四个坑（都已修掉 / 已注释说明）

### 🔴 0. 最危险的一个：可选日期留空会**静默删掉整篇文章**

**这个必须先说，因为它的失败方式是「无声的」。**

`content.config.ts` 里 `updated` 原本是 `z.date().optional()`。
而 Sveltia（以及所有 Decap 系 CMS）对 `required: false` 的日期字段，
留空时会写 `updated: ''` —— **一个空字符串，不是省略该键**。

空串喂给 `z.date()` 会失败，而 `@nuxt/content` 对解析失败的文件是
**只打一条 WARN、然后整个文件忽略**：

```
WARN "posts/blog/xxx.md" is ignored because parsing is failed.
Error: Invalid date value: ""
```

**后果**：你在后台编辑一篇文章 → 更新日期留空 → 保存 →
**那篇文章从站点上消失**，而构建**照样是绿的**，CI 显示成功，没有任何显式报错。

**修法**（已改进 `content.config.ts`）：

```ts
// 原来是：updated: z.date().optional(),
updated: z.union([z.date(), z.string()]).optional(),
```

空串被接受，同时保留 `z.date()` 分支以兼容 yml 里 `2026-09-25`
这种被 YAML 解析成 Date 的写法。这个字段目前没有任何组件读取
（见 `app/composables/usePosts.ts` 的 `PostItem`），所以放宽类型不影响渲染。

**验证过程**（都是实际构建出来的，不是推断）：

| 步骤 | 结果 |
|---|---|
| 建一个 `updated: ''` 的探针文章 | 构建出现 `is ignored because parsing is failed` |
| 试 `z.preprocess(...)` 包一层 | ❌ 无效，仍报同样错误（Content 的 schema 编译不吃运行时 transform） |
| 改 `z.union([z.date(), z.string()])` | ✅ 警告消失，探针**页面被正常生成**（`index.html` 17 KB + `_payload.json` 114 KB） |
| 删掉探针后再构建 | ✅ 干净通过 |

**一句话**：`z.date()` 这种写法会让「后台把更新日期留空」变成静默删文章。
如果你以后往 schema 里加**其他可选日期字段，必须用同样的 union 写法**。

### 1. 必须自托管，不能依赖 CDN

官方文档给的写法是 `<script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js">`。
但 **unpkg 和 jsdelivr 在国内都不稳定**（本机实测两者都超时）。

所以这里把 JS 下下来放进 `public/admin/` 自托管。这跟项目已有的做法一致
（字体已经本地化，注释里写着「国内访问稳定」）。

**升级方式**：改版本号重下
```bash
curl -sL "https://registry.npmjs.org/@sveltia/cms/-/cms-0.220.0.tgz" -o cms.tgz
tar -xzf cms.tgz package/dist
# 复制 package/dist/sveltia-cms.js 和 package/dist/chunks/react-dom.js
```

### 2. `<script>` 标签**不能**加 `type="module"`

Sveltia 靠 `document.currentScript.src` 判断自己是从哪加载的，再据此解析懒加载 chunk
（`chunks/react-dom.js`）的地址。**加了 `type="module"` 之后 `currentScript` 是 `null`，
chunk 会退回从 unpkg 拉** —— 也就是上面那个国内拉不到的地址。

源码依据（bundle 里）：
```js
ZW = (typeof document > 'u' ? void 0 : document.currentScript?.src) || {}.url
```

这也意味着**chunks 必须和主 JS 放在同一目录下**（这里是 `public/admin/chunks/`），
路径会自动算对，子路径部署（`/AI-Blog/admin/`）也一样。

### 3. 不要引入任何 CSS 文件

Sveltia 的样式全部打包在 JS 里。官方文档专门提醒别加
`<link rel="stylesheet" href="...sveltia-cms.css">` —— 那是已停止维护的
StaticCMS 的做法，现在的版本没有独立 CSS 文件。

## 实测结果（都跑过了）

`bun run generate` 通过，后端产物里四个文件都在，起静态服务逐个请求：

| 路径 | 状态 | 实际大小 |
|---|---|---|
| `/admin/` | 200 | 1012 B |
| `/admin/config.yml` | 200 | 4638 B |
| `/admin/sveltia-cms.js` | 200 | 2 178 075 B |
| `/admin/chunks/react-dom.js` | 200 | 220 055 B |

即「`public/admin/` 会被原样复制到部署根目录」这条链路是通的。

## 与 Nuxt Studio 的对比

| | Sveltia CMS（本分支） | Nuxt Studio（另一分支） |
|---|---|---|
| 托管要求 | **纯静态即可**，GitHub Pages 照用 | **必须支持 SSR**，要换平台 |
| 改动量 | 只加 4 个静态文件 | 加模块 + routeRules，构建方式变化 |
| 登录 | PAT 令牌，无需服务器 | 必须配 OAuth 回调 |
| 服务端 | **完全没有** | 有（也就有了运维） |
| 编辑体验 | Markdown 编辑器 + 表单 | TipTap 可视化 + 实时预览（更好） |
| 表单来源 | 手写 `config.yml` | 读你的 zod schema 自动生成 |
| **发布延迟** | 保存后等 CI 重建 | 保存后等 CI 重建（**一样**） |

**关键**：两者都没有解决「发布要等构建」这件事，都走 `git 提交 → CI 重建 → 部署`。
区别只在**要不要服务端**。Sveltia 用零服务端换到了够用的编辑体验。

## 待你自己验证的部分

- **在真实浏览器里点一遍**：本地 `bun run dev` 打开 `/admin/`，看界面是否正常渲染
  （我只能验证到 HTTP 层，界面是 JS 渲染的，必须真开浏览器）。
- **PAT 登录全流程**：用你自己的 token 走一遍，确认能读到文章列表。
- **改一篇文章并保存**，确认提交到了 `feat/sveltia-cms` 分支、CI 有反应。
- **移动端**：这一条对「交付给客户」很关键 —— Sveltia 号称手机可用，
  但手机上生成 GitHub token 的体验是否顺畅，要自己试。
- **图片上传**：确认存进 `public/uploads/`、前台能显示。
  子路径部署下后台内的图片预览可能需要打开 `config.yml` 里的 `site_url`（已注释，有说明）。
- **Sveltia 保存时会不会丢掉「不在 config 里的 frontmatter 字段」**：
  `content/posts/test.md` 里有 `navigation` / `seo` 这类既不在 config、也不在 schema 的字段
  （是 Nuxt Content 的内置字段）。Decap 系 CMS 有「只写 config 定义过的字段」的行为，
  所以第一次保存那篇之后，建议 `git diff` 看一眼有没有被删。
  **我无法在无浏览器环境验证这一条，必须你自己确认。**

> `updated` 留空的问题**已经验证并修掉了**（见上面坑 0），不用再验。
