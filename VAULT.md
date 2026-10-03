# 加密专区（Vault）

私密笔记的加密方案。**正文以密文进仓库**，只有知道密码的人才能在浏览器里解密阅读。

---

## 一句话原理

```
vault-src/*.md        ← 明文，只在你本机（.gitignore 忽略，永不提交）
     ↓  node scripts/vault.mjs lock
content/vault/*.json  ← 密文，提交进仓库（别人 clone 只看到乱码）
     ↓  构建期被 @nuxt/content 索引
/vault 页面           ← 浏览器输入密码 → SubtleCrypto 解密 → 渲染正文
```

别人打开你的 GitHub 仓库，看到的是 `content/vault/xxx.json` 里一长串 Base64。没有密码解不开。

---

## 日常使用

### 写一篇新的私密笔记

```bash
# 1. 建明文笔记（在 vault-src/ 下，随便编辑）
node scripts/vault.mjs new 我的私密笔记

# 2. 编辑那篇 markdown（vault-src/我的私密笔记.md）

# 3. 加密进仓库
node scripts/vault.mjs lock

# 4. 提交
git add content/vault/
git commit -m "vault: 新增私密笔记"
```

### 改一篇已有的

```bash
# 直接编辑 vault-src/ 下的明文，然后重新 lock
node scripts/vault.mjs lock
```

> `lock` 是**全量**重新加密 `vault-src/` 下所有文件，幂等，不用挑单个文件。

### 看看现在什么状态

```bash
node scripts/vault.mjs list     # 列出所有加密条目（标题/日期/大小）
node scripts/vault.mjs status   # 检查有没有「明文改了但忘了 lock」
```

`status` 会告诉你哪个文件忘了同步 —— 建议每次 commit 前跑一下。

### 换一台电脑（把密文拉回来变成明文）

```bash
git clone <你的仓库>
cd my-blog
node scripts/vault.mjs unlock   # 输入密码，全部解密到 vault-src/
```

`unlock` 会精确还原原始文件名（靠密文里记的 `source` 字段），已存在且内容一致的文件会自动跳过。

---

## 密码从哪来

优先级从高到低：

| 方式 | 命令 | 适用 |
|---|---|---|
| 交互式输入（推荐） | 直接 `node scripts/vault.mjs lock` | 隐藏输入、不留 shell 历史 |
| 环境变量 | `VAULT_PASSWORD='...' node scripts/vault.mjs lock` | 脚本 / CI |
| 命令行参数 | `node scripts/vault.mjs lock --password='...'` | **不推荐**，会留在 shell 历史里 |

---

## 密码怎么选

这是**客户端加密**：密文和解密代码都在公开站点上，拿到密文就能离线无限次尝试。

> **实际安全强度 = 你的密码强度**，不是算法强度。

所以：

- 用**长密码**（≥16 位，或 4 个以上不相关的词拼起来，比如 `correct-horse-battery-staple`）
- **别用**名字、生日、常见词、其他网站用过的密码
- 密码丢了就是真的丢了 —— 没有找回机制。找个密码管理器存好

---

## 安全边界（重要，别误解）

**防得住：**

- ✅ 别人浏览你的 GitHub 仓库，看到的是密文
- ✅ 别人 clone 仓库 / 下载站点静态文件，拿不到正文
- ✅ 密文被改一个字节 → AES-GCM 认证失败 → 解不开（能检出篡改）

**防不住：**

- ❌ **暴力破解**：密文公开，可以用 GPU 离线跑字典。这就是为什么密码必须足够长
- ❌ **标题/日期/标签是明文的**。为了解锁前能列出条目，这些字段没加密。
      如果标题本身就敏感，别写进去（或改 `scripts/vault.mjs` 让 title 也进密文）
- ❌ **已经控制你浏览器的人**：解密后明文在内存和 DOM 里，对方能直接读
- ❌ 键盘记录器、屏幕截图、别人看到你输密码

一句话：**这是「防顺手看到」级别的方案**，不是防定向攻击的保险箱。

---

## 技术细节

### 算法

| 环节 | 选择 |
|---|---|
| 密钥派生 | PBKDF2-HMAC-SHA256，210,000 次迭代 |
| 内容加密 | AES-256-GCM（带认证，能检出篡改） |
| 随机数 | 每次加密重新生成 16 字节 salt + 12 字节 IV |
| 密钥属性 | 派生出的 `CryptoKey` 设为不可导出（`extractable: false`） |

### 密文文件格式

`content/vault/<name>.json`：

```json
{
  "v": 1,
  "kdf": "PBKDF2-SHA256",
  "iter": 210000,
  "salt": "<base64, 16B>",
  "iv": "<base64, 12B>",
  "data": "<base64 密文>",
  "title": "笔记标题",
  "date": "2026-10-03",
  "tags": ["私密"],
  "source": "原始文件名.md"
}
```

`title` / `date` / `tags` / `source` 是**明文**的，其余全是加密必需字段。

> ⚠️ 为什么这些元信息是**摊平在顶层**而不是收进 `meta: {...}`：
> `@nuxt/content` 的 `type: 'data'` 集合处理 JSON 时，会把未显式声明的**嵌套对象整个丢弃**
> （实测拿到的 `meta` 是 `{}`，解锁前的列表就没标题了）。所以必须一级平铺。

> ⚠️ 为什么扩展名是 `.json` 而不是 `.enc`：
> `@nuxt/content` 只认 `.md/.yml/.yaml/.json/.csv` 等固定后缀，遇到 `.enc` 直接报
> `Error: .enc files are not supported` 并把文件忽略。我们的密文本体就是 JSON，用 `.json` 正好。

### 解锁模型

「一次解锁整个专区」—— 输入一次密码后，本次访问内切换条目不用重复输入。

实现上，密码缓存在**模块级 JS 变量**里（不落 sessionStorage / localStorage）：
- 刷新页面或关标签页 → 缓存消失，需要重新输入
- 为什么不存 sessionStorage：CryptoKey 不可导出、无法序列化；存密码原文又会扩大暴露面
- 页头有「锁定」按钮，手动清掉缓存

---

## 文件清单

| 文件 | 作用 |
|---|---|
| `shared/vault-crypto.mjs` | 加解密核心库（浏览器与 Node 共用，WebCrypto） |
| `scripts/vault.mjs` | CLI：`new` / `lock` / `unlock` / `list` / `status` |
| `scripts/test-vault-crypto.mjs` | 单元自测（14 项，不需要 dev server） |
| `scripts/test-vault-e2e.mjs` | 端到端验证（需要 dev server 运行） |
| `app/composables/useVault.ts` | 前端解锁状态 + 解密逻辑 |
| `app/pages/vault.vue` | `/vault` 页面 |
| `content/vault/*.json` | 密文（提交） |
| `vault-src/*.md` | 明文（**不提交**，见 `.gitignore`） |

---

## 测试

```bash
# 单元自测：往返一致、错误密码、篡改检出、随机性、格式防御
node scripts/test-vault-crypto.mjs

# 端到端（先跑 dev server）
bun run dev                    # 另开一个终端
node scripts/test-vault-e2e.mjs
```

端到端脚本会抓 `/vault` 页面的 SSR payload（浏览器实际拿到的数据），
用密码解密，断言正文与 `vault-src/` 源文件**逐字节一致**，并验证错误密码解不开。

---

## 排查

**构建时报 `.enc files are not supported`**
→ 密文扩展名必须是 `.json`，不是 `.enc`。检查 `scripts/vault.mjs` 的 `ENC_EXT`。

**解锁后列表标题都显示「未命名」**
→ `meta` 被写成了嵌套对象。元信息必须摊平在密文顶层（见上文格式说明）。

**页面说「专区里还没有笔记」**
→ `content/vault/` 下没有 `.json`，先跑 `node scripts/vault.mjs lock`。

**`status` 显示「⚠️ 明文更新了，需要重新 lock」**
→ 你改了明文忘了加密。跑 `node scripts/vault.mjs lock`。

**换电脑 unlock 后文件名变成标题**
→ 旧版密文没有 `source` 字段。在原来那台机器重新 `lock` 一次即可。
