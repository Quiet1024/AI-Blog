# Sveltia CMS 内容后台

博客的内容后台。纯静态实现 —— **不需要任何服务器、不需要换托管**，
部署在 GitHub Pages 上照旧能用。

## 一句话结论

**纯静态站就能有后台。**
登录用 GitHub「访问令牌」(PAT)，内容改完直接提交回仓库，GitHub Actions 自动重建上线。

这正好补上了 Nuxt Studio 的那个硬伤（Studio 要求 SSR，用不了 GitHub Pages）。

## 它做了什么

**新增 4 个静态文件 + 1 处 schema 修复**（后者是为了修掉一个会静默删文章的坑，见下面 坑 0）：

| 文件 | 说明 |
|---|---|
| `public/admin/index.html` | 后台入口（1 KB） |
| `public/admin/config.yml` | 字段配置（4.6 KB）—— 改这个就是改后台表单 |
| `public/admin/sveltia-cms.js` | CMS 本体，**自托管**（2.08 MB） |
| `public/admin/chunks/react-dom.js` | 懒加载 chunk，**自托管**（215 KB） |
| `content.config.ts` | `updated` 改成 union，容忍空串（**必须改，理由见坑 0**） |
| `.gitattributes` | 固定上述 JS 的行尾，禁止 LF→CRLF 转换（理由见坑 4） |
| 本文件 | 说明 |

**没有改 `nuxt.config.ts`、没有加依赖、没有构建步骤。**
`public/` 目录 Nuxt 会原样复制到产物，所以这些文件自动出现在 `/admin/` 下。

## 访问地址

- 线上：https://quiet1024.github.io/AI-Blog/admin/
- 本地：`bun run dev` 后打开 `http://localhost:3000/admin/`

## 怎么用

### 本地看界面

```bash
bun run dev
# 打开 http://localhost:3000/admin/
```

会看到 Sveltia 的登录页（本地不需要登录就能看到界面）。

### 线上真正用起来

访问 `https://quiet1024.github.io/AI-Blog/admin/`，点
**「Sign In Using Access Token」**（注意：登录卡片上会并列好几个入口，
`Sign In with GitHub` 和 `Sign In with Link/Mobile` 在本项目**都用不了**，
它们分别需要 OAuth 后端和额外部署的服务）：

1. 点按钮 → 跟着弹窗里的链接去 GitHub 生成令牌（**名字和权限已经预选好了**）
2. 打开的是 **fine-grained token** 页面，`Token name` 和 `Contents: Read and write`
   都帮你填好了
3. ⚠️ **`Repository access` 要自己选**（GitHub 不支持用链接预填）：
   选 `Only select repositories` → 勾 `Quiet1024/AI-Blog`
4. 生成 → 复制 `github_pat_...` → 粘回后台，登录完成

令牌存在浏览器本地，下次不用再填。

**为什么这个方式好**：不用建 OAuth App、不用部署任何服务、不给第三方任何权限。

**⚠️ 权限有个坑（实测踩过）**：fine-grained token 只给 `Contents: Write`
的话，只能读、一保存就报 `Resource not accessible by personal access token` ——
因为 fine-grained token 的 Contents 写权限**只对默认分支放开**，
而本后台提交到 `main`（默认分支）本该没问题……如果仍报错，两个办法：
把 `Contents` 和 `Workflows` 都设成 Read and write（改完**退出后台重登**），
或直接换**经典令牌**（https://github.com/settings/tokens/new 勾 `repo` 一个 scope），
经典令牌对所有分支都能写，最省事。

**⚠️ 每次保存后建议 `git diff` 看一眼**：后台保存会写回 config 里定义过的**所有**字段
（留空会落成 `字段: ''`），而且年份、排序这类手填字段很容易输错，
CMS 不做任何校验。实测就抓到过一次年份被误改。
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

- **正文强制纯文本模式（`modes: [raw]`）**：这一条是必须的，理由见下一节。
- **日期不指定 `format`**：Sveltia 用 Day.js（不是 moment），`datetime` 默认就输出
  ISO 的 `YYYY-MM-DD`，与现有文章的 `date: 2026-09-18` 完全一致。
  官方也建议「尽量用 ISO，格式化交给应用代码」。
- **作品配色用 `select`**：取值来自 `app/data/covers.ts` 里注册的 6 套
  （teal / amber / moss / ocean / clay / ink），避免手打出不存在的 key。
- **上传的图存 `public/uploads/`**，前台引用写成 `/uploads/xxx.png`，
  与现有 `/chatmap/xxx.png` 同一种约定。**正文里怎么插图见下面「纯文本模式下怎么插图」一节。**

## 🔴 正文必须用纯文本模式，否则长文会被改坏

**症状**：在后台编辑长文章时出现「只有部分标题被识别」、表格 / 分隔线 / 嵌套结构变形，
甚至整段内容消失。短文章往往看不出来，**越长、语法越复杂越明显**。

**根因**：Sveltia 的 `markdown` widget 底层是 **Lexical**（富文本框架），
默认模式是 `[rich_text, raw]` —— **`rich_text` 在前，所以打开文章默认进富文本编辑器**。
富文本编辑器会把 Markdown **解析成节点树，保存时再序列化回 Markdown**。
这个往返只认得它自己那套节点类型，不认识的写法在解析阶段就丢了。
（实测：水平线在往返后从 `---` 变成 `***`，两个都能渲染，但**说明它确实在改写你的原文**。）

**修法**：给正文字段加 `modes`，强制纯文本：

```yaml
- label: 正文
  name: body
  widget: markdown
  modes: [raw]
```

纯文本模式下编辑器**不再解析**，正文就是 Markdown 源码本身，所见即所存。

**取值命名看着像两套，其实是两层（已核对 bundle 源码，不是猜的）**：

配置里写的是**对外名字**，运行时用的是**内部名字**，中间有一张明确的映射表：

```js
OTe = ['rich_text', 'raw']                              // ① schema 的 enum（配置层取值）
kTe = { rich_text: 'rich-text', raw: 'plain-text' }     // ② 映射表：对外名 → 内部名
T   = A(() => modes.map((e) => kTe[e]).filter(Boolean)) // ③ 配置数组先过映射表
// ④ 判定：M(s, e.modes[0] === `rich-text` || e.isCodeEditor, true)
```

所以 `modes` 的真实语义是「**映射后，第一个元素是不是 `rich-text`**」：

| 配置写法 | 映射后 | 打开时进哪个模式 |
|---|---|---|
| `[raw]` | `['plain-text']` | 纯文本，无切换器 |
| `[raw, rich_text]` | `['plain-text', 'rich-text']` | **纯文本** + 工具栏多一个模式切换器 |
| `[rich_text, raw]` | `['rich-text', 'plain-text']` | 富文本（= 官方默认行为） |

**结论**：本项目用 `[raw]`，纯文本、无切换器、不会被改写。
想让编辑器**保留富文本切换按钮**（默认仍进纯文本）就写 `modes: [raw, rich_text]` ——
但一旦切到富文本，全文就会被重新序列化，复杂格式可能被改写，所以这里默认不给。

> 📌 订正记录：本文档早前写过「`rich_text` ≠ `rich-text`，所以永远进不了富文本」，
> 那是**错的** —— 漏看了 ② 这张映射表。实际 `[rich_text, raw]` 就是富文本默认。

**顺带澄清**：`markdown` 和 `richtext` 在 Sveltia 里是**同一个 widget 的别名**，
写哪个都一样；行为差异完全由 `modes` 决定。这一点和 Decap/Netlify CMS 的直觉不一样。

### 已经被改坏的文章，怎么救回来

改坏的标准长相（实测遇到过一整篇）：**整篇正文被包进一个 4 反引号的 ````plain` 代码块**，
首尾各一行围栏；同时**所有空行被加倍**（原文单空行 → 变成双空行）。

```markdown
---

````plain                    ← 罪魁：整篇被塞进这个围栏里
# 文章标题
...
````                         ← 对应的收尾

```

为什么是 4 个反引号：正文里本来就有 ```ts 代码块，Lexical 用 4 个反引号来避免冲突——
这也反过来证明了「它确实重新序列化过你的全文」。

**修复手法（只动格式，正文一字不改）**：

1. 删掉正文首尾那两行 4 反引号围栏；
2. 把所有**连续 ≥2 个空行**压回 1 个；
3. 行尾统一成 LF（仓库里其它文章都是 LF）。

做完跑 `bun run generate`，确认输出是 `Processed N collections and M files` 而**没有**
`is ignored` / `parsing is failed`。想更稳，可以直接查产物 HTML：
`<h2>` / `<table>` / `<hr>` 的个数应与你文章里的章节数、表格数对得上，
且**不应该出现一个包住全文的 `<pre>`**。

> 判断「文件有没有被改坏」的一行检查：文件里**不该有任何以 4 个及以上反引号开头的行**，
> 且**不该有连续 2 个以上的空行**。

## 🖼️ 纯文本模式（raw）下怎么在正文里插图

`modes: [raw]` 买到的是「正文一个字都不会被改写」，代价是**工具栏的插图按钮没了**。
这是官方的明确行为，不是配置写错。官方 RichText 文档的 Future Plans 一节原文：

> *These buttons are disabled when raw mode is active.*

而「把本地/远程图片拖进编辑器、或直接粘贴，自动上传并插入」同样是 **Lexical（富文本）** 的能力，
纯文本编辑器不具备。所以 raw 模式下**不存在**一键插图的入口 —— 这是取舍，不是 bug。

### 方案 A（推荐，零风险）：资产库上传 + 手写 Markdown

Sveltia 自带完整的**资产库**（侧栏 `Asset Library`，与 `Collections` / `Entries` 平级），
上传目标就是 `config.yml` 里的 `media_folder: /public/uploads`。

1. 侧栏进 **Asset Library** → 上传（支持拖拽、批量）
2. 选中图片 → **Copy file path**
3. 回到正文，手写一行 Markdown，**并把复制到的路径开头的 `/public` 删掉**：

   ```markdown
   ![图片说明](/uploads/xxx.png)
   ```

#### ⚠️ 资产库给的两个地址都不能直接粘（2026-09-30 线上实测）

| 资产库里显示的 | 值 | 实测结果 |
|---|---|---|
| 公开 URL | `https://quiet1024.github.io/uploads/xxx.png` | **404** ❌ 缺部署子路径 |
| 文件路径 | `/public/uploads/xxx.png` | **404** ❌ 那是仓库路径，不是站点路径 |
| 正文里该写的 | `/uploads/xxx.png` | **200** ✅ |

**公开 URL 为什么是坏的：Sveltia 的固有限制，配 `site_url` 也救不回来。**
bundle 源码里它拿到 `site_url` 之后**只取 origin**，路径被丢掉了：

```js
n._siteURL = n.site_url?.trim() || window.location.origin
n._baseURL = new URL(n._siteURL).origin     // ← /AI-Blog 在这里被扔掉
```

`_siteURL` 全项目只用于「查看站点」那个链接；拼资源地址用的是 `_baseURL`（纯域名）。
所以**子路径部署下「公开 URL」永远是错的，别用它**。

复制菜单里只有 Public URL / File Path / File ID / File Data，**没有「复制为 Markdown」**，
所以不存在一步到位的办法 —— 只能手删 `/public` 那 7 个字符。
（`config.yml` 里正文的 `hint` 已经把这句话写在编辑框旁边了。）

**为什么正文里必须写根绝对路径 `/uploads/...`**：与现有 `/chatmap/...` 同一种约定，
由 `ProseImg.vue` 交给 NuxtImg 自动补部署子路径。实测线上已发布文章的 `<img>` 输出为
`/AI-Blog/_ipx/_/chatmap/sidebar-overview.png`，该地址实测 **200** —— 链路是通的。

**⚠️ 文件名用英文或数字**：正文图片会走 **IPX 处理管线**，
非 ASCII 文件名在 URL 里会变成 percent-encoded 形式，多一层风险，没有必要。

> 💡 一条好用的排查经验：`_ipx/_/<路径>` 是**按内容引用按需生成**的。
> 实测 `/_ipx/_/uploads/1790773299095.png` 现在是 404 ——
> 因为**还没有任何文章引用它**。所以「图片传上去了但线上没有这个地址」是正常的，
> 把它写进正文、触发一次构建就会出现。
> 反过来说：**图片不显示时，先确认正文里引用的路径拼对了**，别急着怀疑上传失败。

### 方案 B（顺手，但有代价）：开富文本切换

把正文字段改成 `modes: [raw, rich_text]`：工具栏多出**模式切换器**，默认仍进纯文本。
需要插图时切到富文本 → 一键插图 / 拖拽 / 粘贴 → 再切回 raw。

⚠️ 代价是实打实的：**只要切到富文本，全文就会走一遍
「Markdown → Lexical 节点树 → Markdown」的往返** —— 正是当初要避免的那个改写过程。
`:::` 容器、表格、代码块、嵌套列表都有被吃掉的风险。

**建议**：只在**短文章**里这么用；长技术文老老实实走方案 A。

### 为什么不给正文单独加一个 `image` 字段

看着方便，实则有害：那个字段会作为**新的 frontmatter 键**写进 `.md`，
而它并不在 `content.config.ts` 的 zod schema 里。
`@nuxt/content` 对 schema 外的键处理很严，风险与「坑 0」（空串日期静默删文章）同源 ——
**能不加未知 frontmatter 字段就不要加。**

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

| | Sveltia CMS（已合并进 main） | Nuxt Studio（`feat/nuxt-studio` 分支） |
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

## 已知的待改进项

- **新建文件用的是随机 ID 文件名**：`config.yml` 里没配 `slug`，
  所以后台新建作品/文章时，文件名会长成 `88ab2d9a01f7.yml` 这样。
  功能没问题（前台读目录下所有文件，不看文件名），但不利于日后维护。
  要改就在对应 collection 下加 `slug: '{{fields.name}}'`。
  （已经手工重命名过一个：`88ab2d9a01f7.yml` → `lingxi-workbench.yml`，
  用 `git mv` 保留历史。）
- **后台内图片预览**：`config.yml` 里 `site_url` 已打开（子路径部署需要它）。

## 待你自己验证的部分

- ~~在真实浏览器里点一遍~~ ✅ 已实测：登录、新建作品、修改作品均成功
  （远程产生过 `Create 作品` / `Update 作品` 两条提交）。
- **移动端**：这一条对「交付给客户」很关键 —— Sveltia 号称手机可用，
  但手机上生成 GitHub token 的体验是否顺畅，要自己试。
- ~~**图片上传**：确认存进 `public/uploads/`、前台能显示。~~
  ✅ 2026-09-30 已实测确认：侧栏有 `Asset Library` 入口；上传后文件进 `public/uploads/`
  （`https://quiet1024.github.io/AI-Blog/uploads/1790773299095.png` 实测 200）。
  **同时暴露了一个真问题**：资产库显示的「公开 URL」和「文件路径」**都是 404**，
  正文必须写 `/uploads/xxx.png`。完整对照表与根因见上面「纯文本模式下怎么插图」。
- **图片不显示时怎么定位**：正文里的路径是唯一容易错的一环（见上一条）。
  另外 `_ipx/_/<路径>` 是按内容引用按需生成的，
  没被任何文章引用的图片在线**本来就没有** `_ipx` 地址 —— 这不是故障。
- **Sveltia 保存时会不会丢掉「不在 config 里的 frontmatter 字段」**：
  `content/posts/test.md` 里有 `navigation` / `seo` 这类既不在 config、也不在 schema 的字段
  （是 Nuxt Content 的内置字段）。Decap 系 CMS 有「只写 config 定义过的字段」的行为，
  所以第一次保存那篇之后，建议 `git diff` 看一眼有没有被删。
  **我无法在无浏览器环境验证这一条，必须你自己确认。**
- **构造更复杂的文章**（含 `:::` 容器、Vue 组件）后保存，确认 MDC 语法没被改写坏。
  正文用的是 `markdown` 模式，理论上原样保留，但值得实测一次。

> `updated` 留空的问题**已经验证并修掉了**（见上面坑 0），不用再验。

