#!/bin/bash
# ============================================================
# AI-Blog 提交脚本（.git 修复完成后使用）
#
# 【前提】你已经跑完 scripts/fix-git-repo.sh，本地 .git 是全新的，
#         且索引已对齐线上 af55682。
#
# 【本脚本做的事】分 2 个提交：
#         ① 文件名 ASCII 化（修复线上仍存在的 4 篇中文名文章）
#         ② 加密专区（Vault）
#         然后 push。
#
# 【用法】
#   bash /e/my-work-boke/my-blog/scripts/commit-changes.sh
# ============================================================
set -e

REPO="/e/my-work-boke/my-blog"
cd "$REPO"

echo "════════ 提交前检查 ════════"
echo ""

echo "--- 1. 确认 .git-broken 已被忽略（绝不能提交）---"
if git status --porcelain | grep -q 'git-broken'; then
  echo "❌ 危险：.git-broken-* 出现在待提交清单里！"
  echo "   请先检查 .gitignore 是否包含 .git-broken-*/"
  exit 1
fi
echo "✅ .git-broken-* 未出现在清单中"

echo ""
echo "--- 2. 确认 vault 明文不会被提交（加密的前提）---"
if git status --porcelain | grep -q 'vault-src'; then
  echo "❌ 危险：vault-src/（明文笔记）出现在待提交清单里！"
  exit 1
fi
echo "✅ vault-src/ 明文未被提交"

echo ""
echo "--- 3. 确认 vault 密文会进仓库（这是有意的）---"
if git status --porcelain | grep -q 'content/vault'; then
  echo "✅ content/vault/（密文）将被提交"
else
  echo "⚠️  警告：content/vault/ 不在清单里，加密专区的内容可能不会被发布"
fi

echo ""
echo "--- 4. 确认线上那 4 张图还在（避免误删配图）---"
MISSING=0
for f in 1790942853815 1791020526194 1791020550286 1791020728158; do
  if [ ! -f "public/uploads/$f.png" ]; then
    echo "  ❌ 缺失 public/uploads/$f.png —— 提交会把它从线上删掉！"
    MISSING=1
  fi
done
if [ "$MISSING" = "1" ]; then
  echo ""
  echo "  请先补回这些图，再重跑本脚本。"
  echo "  例如：curl -L -o public/uploads/<名字>.png \\"
  echo "        https://raw.githubusercontent.com/Quiet1024/AI-Blog/main/public/uploads/<名字>.png"
  exit 1
fi
echo "✅ 4 张配图都在"

echo ""
echo "--- 5. 确认不含 test.md / ces.md 这类测试文件 ---"
for f in "content/posts/test.md" "content/posts/ces.md"; do
  if [ -f "$f" ]; then
    echo "  ⚠️  $f 还在本地。如果是测试文件，建议先删掉再提交。"
  fi
done

echo ""
echo "════════ 开始提交 ════════"
echo ""

echo "【提交 1/2】文件名 ASCII 化"
git add -A content/posts/ content/projects/ .github/ nuxt.config.ts content.config.ts \
        package.json public/admin/config.yml scripts/check-content-filenames.mjs \
        app/composables/usePosts.ts .gitignore SVELTIA-CMS.md public/uploads/

git commit -m "fix(content): 文件名全部 ASCII 化，修掉 path 塌缩导致的文章内容互相覆盖

线上仍残留 4 篇中文文件名文章（ASCII 修复此前未能完整推送）：
  ai灵犀工作台.md                          -> ai-lingxi-workbench.md
  ai自动化找工作.md                        -> ai-job-hunting.md
  c盘爆了？？别慌-不用重装还能抢救.md      -> c-drive-full-rescue.md
  用-playwright-驱动「用户自己的-chrome」… -> playwright-user-chrome-cdp.md

同时：
  - content/projects/d6c6ac7f7eed.yml -> ai-job-hunting.yml（CMS 随机 ID 改为有意义 slug）
  - 删除测试文件 content/posts/ces.md
  - .gitignore 增加 .git-broken-*/ 与 _worktree-backup.tar.gz（防抢救现场误入库）"

echo ""
echo "【提交 2/2】加密专区"
git add VAULT.md app/pages/vault.vue app/composables/useVault.ts \
        shared/ scripts/vault.mjs scripts/test-vault-crypto.mjs scripts/test-vault-e2e.mjs \
        scripts/fix-git-repo.sh scripts/commit-changes.sh \
        content/vault/ app/data/site.ts

git commit -m "feat(vault): 新增加密专区（密文入库 + 密码解锁）

- 私密笔记以 AES-256-GCM 密文存放于 content/vault/*.json
- 明文只在本机 vault-src/（已 .gitignore，绝不入库）
- /vault 页面输密码后由浏览器 SubtleCrypto 解密，密码不落盘
- 已从首页/列表/标签云/搜索/RSS/sitemap 全部排除
- 附单元自测 14 项 + 端到端 6 项"

echo ""
echo "════════ 提交完成，现在推送 ════════"
echo ""
git log --oneline -3
echo ""
echo "--- 推送到 GitHub ---"
if git push origin main; then
  echo ""
  echo "✅ 推送成功！"
else
  echo ""
  echo "❌ 推送失败。请把上面的报错发给助手。"
  echo "   常见情况："
  echo "     - 网络不通（Failed to connect to github.com:443）"
  echo "       → 等网络恢复后重跑：git push origin main"
  echo "     - 被拒（fetch first）→ 说明远端又有新提交，需要先合并"
fi
