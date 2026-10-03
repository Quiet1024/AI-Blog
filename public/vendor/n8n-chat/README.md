# n8n Chat — 自托管资源

这里放的是 **`@n8n/chat` 的预构建产物**，由本站自己提供，**不引用任何外部 CDN**。

## 为什么不直接用 CDN

官方示例是这么写的：

```html
<link href="https://cdn.jsdelivr.net/npm/@n8n/chat/dist/style.css" rel="stylesheet" />
<script type="module">
  import { createChat } from 'https://cdn.jsdelivr.net/npm/@n8n/chat/dist/chat.bundle.es.js';
</script>
```

两个问题：

1. **国内网络下 jsdelivr 不可靠。** 实测浏览器直接报
   `net::ERR_CERT_AUTHORITY_INVALID`（DNS 污染 / 中间人证书），
   属于**运行时不可控**的第三方依赖 —— 访客的浏览器拉不到，聊天入口就是打不开。
2. **不带版本号的 URL 会被解析成 `latest`。** 等于把线上站点绑在一个随时会变的上游上，
   某天上游改了默认行为就会静默坏掉。

改成本站同源文件后：不受第三方 CDN 可达性影响、无跨域、无证书问题、版本由仓库里的文件本身锁定。

## 这是什么版本

| 项 | 值 |
|---|---|
| 包名 / 版本 | `@n8n/chat` **1.40.3** |
| 来源 | `https://registry.npmmirror.com/@n8n/chat/-/chat-1.40.3.tgz` → `package/dist/` |
| 官方仓库 | https://github.com/n8n-io/n8n （`packages/@n8n/chat`） |
| 许可证 | Sustainable Use License（见同目录 `LICENSE.md`） |

| 文件 | 字节 | SHA-256 |
|---|---|---|
| `chat.bundle.umd.js` | 1,624,923 | `fc56bb848e2907c38006c2315ad8c3051885502bd891942b41e64defaa9b5bef` |
| `style.css` | 34,312 | `e57527e99116a97038066b242fda2823fe159bd12b1c5951a6a3bb2d6c9c05a4` |

> 这两个文件**逐字节原样复制，未做任何修改**（`style.css` 首行的
> `/*! Package version @n8n/chat@1.40.3 */` 声明因此得以保留）。
> 也正因如此，本目录才能只附许可证、而不必额外声明「本副本已被修改」。

## 为什么用 UMD 版，而不是官方示例里的 ESM 版

`dist/chat.bundle.es.js` **不是自包含的**。实测它的依赖：

```
静态 import : ./vue.runtime.esm-bundler-*.mjs, ./en-*.mjs
动态 import : ./node-icons-*.mjs
```

自托管 ESM 版就必须连带整个依赖闭包（`emojiData-*.mjs`、`lucideIconData-*.mjs` 等
带 hash 的分片，合计 6 MB+），还要额外处理 `.mjs` 在静态托管上的 MIME 类型问题。

而 `chat.bundle.umd.js` 是**单文件**：零 `require()`、零动态 import、零 `.mjs` 引用，
加载后暴露 `window.N8nChat`，用 `.js` 扩展名也不会有 MIME 问题。
（`dist/chat.umd.js` 是另一个变体，它需要外部全局 `Vue`，所以不用它。）

## 怎么升级

```bash
V=1.41.0   # ← 换成目标版本
curl -L -o /tmp/n8n-chat.tgz "https://registry.npmmirror.com/@n8n/chat/-/chat-$V.tgz"
tar -xzf /tmp/n8n-chat.tgz -C /tmp
cp /tmp/package/dist/chat.bundle.umd.js public/vendor/n8n-chat/
cp /tmp/package/dist/style.css          public/vendor/n8n-chat/
cp /tmp/package/LICENSE.md /tmp/package/LICENSE_EE.md public/vendor/n8n-chat/
```

升级后核对 SHA-256 并更新本文件里的版本表与
`app/components/site/ChatWidget.vue` 注释中的版本号。

**升级前先确认这两件事没变**（变了就要改组件）：① 全局名仍是 `window.N8nChat`；
② 仍导出 `createChat`。快速核对：

```bash
node -e "const s=require('fs').readFileSync('public/vendor/n8n-chat/chat.bundle.umd.js','utf8');
console.log('N8nChat 全局:', /\.N8nChat\s*=/.test(s));
console.log('createChat :', /\.createChat\s*=/.test(s));
console.log('自包含     :', !/require\(|import\(/.test(s));"
```
