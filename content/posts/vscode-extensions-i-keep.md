---
title: "VS Code 插件：装了又删之后，我留下的那七个"
description: "插件清单到处都是，但没人写哪些最后会被卸掉。这里只留七个，每个对应一个每天都会撞上的具体困扰；附 code --install-extension 命令和 settings.json，另外单开一节写我装上又删掉的。"
date: 2026-09-23
tags: [编辑器, 工具]
kicker: 插件
featured: false
draft: false
serif: true
author: 站长
---

有段时间我把插件列表当收藏夹用。装到三十来个之后，症状是这样的：编辑器冷启动变慢，右键菜单长到要滚动，而真正常用的还是最开始那几个。

后来我给自己定了一条判断标准，只留一条：

> 它有没有替我做掉一个**每天都会遇到的具体动作**？

"可能会用到"不算，"看起来很强"不算，"别人都在用"更不算。按这条过一遍，剩下的就七个。

## 一、Vue - Official（`Vue.volar`）

写 Vue 3 的单文件组件就必须有这个。模板里的类型推断、组件标签的补全和跳转、`<script setup>` 里的宏，全靠它。

**要注意的是它改过名。** 以前叫 Volar，现在商店里搜 Volar 是搜不到的，得搜 "Vue - Official"。同一个扩展，换了壳。另外两件相关的事：

- **`TypeScript Vue Plugin` 已经废弃**，功能并进主扩展了。如果之前装过，可以直接卸掉。
- **别和 Vetur 同时开**。Vetur 是 Vue 2 时代的，两个一起开会互相抢语法服务。老项目多的话，用工作区级别的「禁用（工作区）」单独关掉其中一个。

顺手一个我用了很久才发现的功能：组件可以直接**鼠标拖进模板**，按住 shift 放进去，`import` 会自动补好。

```bash
code --install-extension Vue.volar
```

## 二、Error Lens（`usernamehw.errorlens`）

VS Code 原生的诊断是一条波浪线，你得把鼠标移上去才看得到内容。Error Lens 把消息**直接写在那行代码后面**。

差别在反馈延迟上。类型错了、ESLint 报了，你不用做任何动作就能看见——而"需要主动悬停"这件事，意味着你在打字的时候根本不会去看。

它不产生任何新错误，只是把已经存在的诊断挪到了你眼前。字符数多的时候会有点吵，可以在设置里限制只显示第一行。

```bash
code --install-extension usernamehw.errorlens
```

## 三、Prettier（`esbenp.prettier-vscode`）

格式化这件事，最贵的地方不是排版本身，是**每一次 code review 都在讨论引号和缩进**。交给它之后这类讨论就没了。

关键是 `formatOnSave` 一定要开——手动触发格式化，等于永远在"等想起来再格式化"。

```bash
code --install-extension esbenp.prettier-vscode
```

## 四、ESLint（`dbaeumer.vscode-eslint`）

Prettier 管长相，ESLint 管**错误**：未使用的变量、漏掉的 `await`、可能的空引用、React/Vue 里那些会真出问题的写法。

两者配合有一个细节容易踩：**让 ESLint 负责代码质量，让 Prettier 负责排版**，不要在 ESLint 里再开一堆和格式相关的规则，否则保存时两个工具会来回改同一行（存一次、改一次、再存一次才稳定）。

```bash
code --install-extension dbaeumer.vscode-eslint
```

## 五、Tailwind CSS IntelliSense（`bradlc.vscode-tailwindcss`）

用 Tailwind 的话这个是刚需，因为它解决的不是"打字快一点"，而是**"这个 class 到底存不存在、它编译出来是什么"**：

- `class` 属性里的自动补全和语法高亮；
- 悬停直接显示这个 class **编译后的真实 CSS 值**——`text-sm` 到底是几 px、`px-5` 到底是几 rem，不用去猜或者翻文档；
- 标出不存在的 class。Tailwind 拼错的 class **不会报错，只是没样式**，这个提示能救掉一整类"样式怎么不生效"。

```bash
code --install-extension bradlc.vscode-tailwindcss
```

## 六、GitLens（`eamodio.gitlens`）

回答"这行代码为什么长这样"的最快路径。行级 blame 直接告诉你最后一次改它的是谁、哪个提交、提交信息写了什么——**不用切终端、不用 `git blame` 再对着 hash 猜**。

但有一件事一定要关：**当前行的 blame 默认是常驻显示的**。它会在每行末尾挂一段灰色小字，代码本来就密的时候非常吵。我关掉它，只留悬停时显示：

```jsonc
// 关掉常驻的当前行 blame，只保留悬停查看
"gitlens.currentLine.enabled": false,
```

```bash
code --install-extension eamodio.gitlens
```

## 七、REST Client（`humao.rest-client`）

调接口不用离开编辑器，也不用装 Postman。新建一个 `.http` 文件，把请求写下来，点上面的 Send Request，结果开在右边。

它比 GUI 客户端好用的点是：**请求本身是一个文本文件**。于是它天生可以进版本库、可以 code review、可以跟接口文档放一起、可以在同事之间直接复制。Postman 的 collection 导出成 JSON 之后没人愿意看，`.http` 文件是可以直接读的。

```http
@host = http://localhost:3000

### 列文章
GET {{host}}/api/posts
Authorization: Bearer {{token}}

### 建一条
POST {{host}}/api/posts
Content-Type: application/json

{
  "title": "hello",
  "tags": ["工具"]
}
```

`###` 是请求之间的分隔符；`{{token}}` 这类变量可以在同一个文件里定义，也可以放到环境文件里。它甚至能跟 VS Code 的调试配置联动，但那样就复杂了——我平时只用它来手点。

```bash
code --install-extension humao.rest-client
```

## 一次性装完

上面的七个，一条命令：

```bash
code --install-extension Vue.volar \
  --install-extension usernamehw.errorlens \
  --install-extension esbenp.prettier-vscode \
  --install-extension dbaeumer.vscode-eslint \
  --install-extension bradlc.vscode-tailwindcss \
  --install-extension eamodio.gitlens \
  --install-extension humao.rest-client
```

加 `--force` 可以跳过确认提示，适合写进新机器的初始化脚本。

## settings.json 里比插件更值钱的几行

插件只是能力，配置才决定它什么时候**自动**发生。这几条是我每个项目都会配的：

```jsonc
{
  // 保存即格式化：省掉「想起来才格式化」这一类问题
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",

  // 保存时顺手把 ESLint 能自动修的修掉、把 import 排序整理
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "explicit"
  },

  // 全文搜索时排除构建产物，否则搜什么都先被 dist 淹一遍
  "search.exclude": {
    "**/dist": true,
    "**/.nuxt": true,
    "**/.output": true,
    "**/node_modules": true
  },

  // 粘贴时自动按上下文缩进
  "editor.formatOnPaste": true
}
```

> `source.fixAll.eslint` 的值是 `"explicit"` 而不是 `true`。这是 VS Code 较新版本的写法：保存时只修"明确要求"的那一类，避免和格式化互相踩。写成 `true` 在部分版本上会提示已废弃。

## 我装上又删掉的

这一节可能比上面更有用。

| 插件 | 为什么删 |
| --- | --- |
| **indent-rainbow** | 每层缩进一个颜色。想法很好，但代码密的时候整屏彩色反而更难扫，而且我大部分时间在看真实缩进——层次靠缩进本身和折叠就够了 |
| **Import Cost** | 在 import 后面标体积。数字经常和最终产物对不上（tree-shaking、动态导入、压缩都会影响），容易得出错误结论。真要管体积，看构建产物的分析结果 |
| **Auto Rename Tag** | 改开标签自动改闭标签。Vue/JSX 场景下 Vue - Official 和内置的 TS 支持已经覆盖了，装了基本没感知 |
| **Todo Tree** | 把全项目的 TODO 聚到一个面板。功能没问题，问题是我的项目里 TODO 根本不该长期存在——真要紧就开 issue，不要躺在注释里 |
| **一套图标主题** | 纯审美。我最后发现原生图标更安静，文件类型靠扩展名和路径就能认出来 |

规律很一致：**凡是"信息更多"而不是"动作更少"的插件，最后都被我删了。**

## 插件本身也会拖慢编辑器

这条经常被忽略。插件跑在扩展宿主进程里，装多了会明显影响窗口启动和内存。有次我的编辑器打开就卡，排查方法是：

```bash
# 看已装了哪些、版本是多少
code --list-extensions --show-versions

# 打印进程占用和诊断信息（含扩展宿主的开销）
code --status

# 以「全部禁用扩展」的方式启动，用来确认问题是不是插件引起的
code --disable-extensions
```

`--disable-extensions` 是**排错用的杀手锏**：如果禁用之后编辑器恢复正常，那就是某个插件的问题，接下来用「一半一半」的方式二分定位就行。

另外如果你要同时开几个项目（比如一前端一后端），用**配置文件（Profile）**比装两套插件干净：

```bash
code ~/projects/web --profile "Web Development"
```

## 最后

这份清单的筛选标准只有一条：**它替我做掉了哪个动作**。所以它注定是偏的——我做的是写页面、调接口、读日志这类事，不写 C#、不碰 K8s，那些方向的插件我一个也没列。

如果你只打算装一个，我建议是 **Error Lens**。它改变的不是你能做什么，而是你**多久能看到出错**。

上面每个插件的完整标识符都写在命令里了，可以自己去商店搜同一个 ID 核对——顺带看一眼"最近更新"和安装量，比任何清单都可靠。
