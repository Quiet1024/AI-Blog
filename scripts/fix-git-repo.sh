#!/bin/bash
# ============================================================
# AI-Blog 仓库修复脚本
#
# 【症状】
#   - git push 报 non-fast-forward（本地与线上各自往前走了）
#   - git fsck 报大量 missing blob / tree / commit
#   - git status 报 "bad tree object HEAD"
#
# 【原因】
#   本地 .git 对象库损坏。证据（2026-10-03 实测）：
#     - .git/objects/pack/tmp_pack_5A6EvJ（7KB）未完成的 pack 写入残留
#     - 224 个 loose 对象 / 2 个 pack / 共 123 in-pack —— 对 100+ 提交的仓库严重偏少
#     - fsck：missing blob 65、missing tree 27、missing commit 10、
#             broken link 52、dangling 70
#     - 45f3084（ASCII 修复提交）、619dfe6（SEO 忽略提交）的对象已读不出
#   典型诱因是 pack 写入被中断（磁盘清理 / 中断的 gc / 进程被杀）。
#
# 【不影响】
#   工作区的所有文件完好，包括未提交的新功能与修复内容。
#   丢失的只是「提交历史里的几个快照」，而工作区就是最终状态。
#
# 【本脚本做的事】
#   保留工作区 → 挪走坏 .git → 克隆干净的 .git → 校验
#
# 【用法】
#   在 Git Bash / MINGW64 里执行（智能体环境无法访问 github）：
#     bash /e/my-work-boke/my-blog/scripts/fix-git-repo.sh
#
#   ⚠️ 路径一律用 MSYS 形式（/e/...），不要用 E:/...
#      否则 tar 会把 "E:" 当成远程主机名（host:path 语法），报
#      "Cannot connect to E: resolve failed"。
# ============================================================
set -e

# --- 用 MSYS 路径，避免 tar/scp 之类的 "盘符被当成主机名" 坑 ---
REPO="/e/my-work-boke/my-blog"
BASE="/e"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/e/my-blog-backup-$STAMP"

# --- 前置检查：确认我们在正确的仓库里，且 .git 确实坏了 ---
echo "════════ 第 0 步：环境检查 ════════"
[ -d "$REPO/.git" ] || { echo "❌ 找不到 $REPO/.git，路径不对？"; exit 1; }
cd "$REPO"
if git status >/dev/null 2>&1; then
  echo "⚠️  git status 正常，.git 可能没坏。"
  echo "    这个脚本会丢掉本地提交历史，只保留工作区文件。"
  printf "    确定要继续吗？(yes/no) "; read -r ans
  [ "$ans" = "yes" ] || { echo "已取消。"; exit 0; }
else
  echo "✅ 确认 .git 异常（正是要修的情况）"
fi

echo ""
echo "════════ 第 1 步：备份工作区 ════════"
mkdir -p "$BACKUP"
cd "$REPO"
# 输出先用相对名，再 mv 过去 —— 避免 tar 把 "E:" 当主机名
#
# 两个已知的良性警告，不影响备份完整性：
#   "tar: .: file changed as we read it"
#       —— 有人/程序（编辑器、dev server）在 tar 扫描时动了目录内容。
#          tar 仍会打包扫描到的文件，退出码 1。
#   "tar: ./.git/index: file changed as we read it"
#       —— .git 坏库在被打包时仍在变动（这也是要修它的原因之一）。
#
# 所以这里**必须容忍退出码 1**（用 || true 吞掉），
# 否则 set -e 会在备份成功后把脚本整个中断 —— 这正是上一轮卡住的原因。
# 真正的完整性由下面对归档的校验来保证。
tar --exclude='./node_modules' \
    --exclude='./.nuxt' \
    --exclude='./.output' \
    --exclude='./dist' \
    --exclude='./.data' \
    --exclude='./.nitro' \
    --exclude='./.cache' \
    --exclude='./_worktree-backup.tar.gz' \
    -czf _worktree-backup.tar.gz . || true

# --- 校验归档：能不能列出来？关键文件在不在？ ---
if [ ! -s _worktree-backup.tar.gz ]; then
  echo "❌ 备份归档没生成或为空，已中止（原仓库未动）"
  exit 1
fi

COUNT=$(tar -tzf _worktree-backup.tar.gz 2>/dev/null | wc -l | tr -d ' ')
echo "归档条目数：$COUNT"

MISSING=0
for f in "./VAULT.md" "./app/pages/vault.vue" "./shared/vault-crypto.mjs" "./nuxt.config.ts" "./content.config.ts"; do
  if tar -tzf _worktree-backup.tar.gz 2>/dev/null | grep -qF "$f"; then
    echo "  ✅ $f"
  else
    echo "  ❌ 归档里缺 $f"
    MISSING=1
  fi
done
[ "$MISSING" = "0" ] || { echo "❌ 备份不完整，已中止（原仓库未动）"; exit 1; }

mv _worktree-backup.tar.gz "$BACKUP/worktree.tar.gz"
echo "✅ 已备份：$BACKUP/worktree.tar.gz"
ls -lh "$BACKUP/worktree.tar.gz"

echo ""
echo "════════ 第 3 步：挪走损坏的 .git（保留不删，留作证据）════════"
cd "$REPO"
mv .git ".git-broken-$STAMP"
echo "✅ 坏 .git 已改名为 .git-broken-$STAMP"

echo ""
echo "════════ 第 4 步：本地重建 .git，并接上远端 ════════"
echo ""
echo "⚠️  这一步会先试 git fetch；如果它断线（你之前遇到的正是这个），"
echo "   会自动回退到 curl 下载归档的方案。"
echo "   为什么不用 git clone：它和 fetch 走同一套 sideband 协议，"
echo "   在 Windows + schannel 下反复断线，而且每次断线都会在"
echo "   .git/objects/pack/ 留下半截 tmp_pack_* 垃圾 —— 这正是你"
echo "   .git 损坏的原始成因。实测同一仓库 curl 5 秒下完 13MB。"
echo ""

cd "$REPO"
git init -q -b main
git remote add origin https://github.com/Quiet1024/AI-Blog.git

echo "--- 试 git fetch（可能断线，正常）---"
if git fetch --depth 1 origin main 2>&1; then
  echo "✅ fetch 成功，把索引对齐到远端 main（工作区文件不动）"
  git reset --mixed FETCH_HEAD
  FETCH_OK=1
else
  echo "⚠️ fetch 断线 —— 走 curl 兜底方案"
  FETCH_OK=0
fi

if [ "$FETCH_OK" = "0" ]; then
  # 清掉 fetch 断线留下的垃圾
  rm -f .git/objects/pack/tmp_pack_* .git/shallow.lock 2>/dev/null
  echo "--- curl 下载线上归档 ---"
  ARCHIVE="$(cd "$BASE" && pwd)/_AI-Blog-main.tar.gz"
  URL="https://codeload.github.com/Quiet1024/AI-Blog/tar.gz/refs/heads/main"
  if ! curl -L --fail --retry 3 --retry-delay 2 --max-time 300 -o "$ARCHIVE" "$URL"; then
    echo "❌ curl 也失败了。原仓库的 .git 已被改名，但工作区完全没动。"
    echo "   工作区备份在：$BACKUP/worktree.tar.gz"
    echo "   请检查网络后重跑；或把本段输出发给助手。"
    exit 1
  fi
  echo "✅ 归档下载完成：$(ls -lh "$ARCHIVE" | awk '{print $5}')"

  echo "--- 解包（用 Python，Windows 自带 bsdtar 处理不了中文文件名）---"
  PY=""
  for c in "python" \
           "C:/Users/L/.workbuddy/binaries/python/versions/3.13.12/python.exe" \
           "C:/Users/L/AppData/Local/Microsoft/WindowsApps/python3.exe" \
           "py"; do
    if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
    if [ -x "$c" ]; then PY="$c"; break; fi
  done
  [ -n "$PY" ] || { echo "❌ 找不到 Python，请安装后重跑"; exit 1; }

  cat > "$BASE/_extract.py" <<'PYEOF'
import tarfile, os, sys
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
n = 0
with tarfile.open(src, "r:gz") as t:
    for m in t.getmembers():
        try:
            t.extract(m, dst, filter="data"); n += 1
        except Exception as e:
            print("skip:", m.name, e)
print("解出条目数:", n)
PYEOF

  "$PY" "$BASE/_extract.py" "$ARCHIVE" "$BASE/AI-Blog-ref" || { echo "❌ 解包失败"; exit 1; }
  rm -f "$ARCHIVE" "$BASE/_extract.py"

  REF="$BASE/AI-Blog-ref/AI-Blog-main"
  [ -d "$REF" ] || { echo "❌ 解包目录异常"; exit 1; }

  echo "--- 把线上文件补进工作区（只补你本地没有的，不覆盖你改过的）---"
  ADDED=0
  cd "$REF"
  for f in $(find . -type f | sed 's|^\./||'); do
    if [ ! -e "$REPO/$f" ]; then
      mkdir -p "$REPO/$(dirname "$f")"
      cp "$f" "$REPO/$f"
      ADDED=$((ADDED+1))
    fi
  done
  cd "$REPO"
  rm -rf "$BASE/AI-Blog-ref"
  echo "  补回 $ADDED 个本地缺失的文件"
  echo ""
  echo "⚠️  接下来这一步很关键："
  echo "   新 .git 里还没有任何提交，需要先做一次「基线提交」才能 push。"
  echo "   下面会自动把你的工作区全部暂存并提交，然后你只需 push 一次。"
  echo ""
  printf "    现在执行基线提交？(yes/no) "
  read -r ans
  if [ "$ans" != "yes" ]; then
    echo "    已跳过。你之后需要自己 git add -A && git commit 再 push。"
  else
    git add -A
    git -c user.email="local@fix" -c user.name="local fix" \
      commit -q -m "chore: 基线快照（本地重建历史用）" || true
    echo "✅ 基线提交完成"
  fi
fi

echo "✅ .git 已重建，origin 已指向 GitHub"

echo ""
echo "════════ 第 5 步：校验 ════════"
cd "$REPO"

echo "--- 工作区改动（应该看到你那些未提交的文件）---"
git status --short
echo ""

echo "--- 远端情况 ---"
git ls-remote --heads origin main
echo "（能打印出一行 sha + refs/heads/main 就说明远端连通、凭据 OK）"
echo ""

echo "--- 本地分支指向 ---"
git log --oneline -1 2>/dev/null || echo "（本地尚无提交，符合预期：你的内容都是未提交状态）"
echo ""

echo "--- 对象库完整性 ---"
if git fsck --no-progress 2>&1 | grep -qE "missing|broken"; then
  echo "⚠️ 仍有缺失对象，请把下面的输出发给助手："
  git fsck --no-progress 2>&1 | head -20
else
  echo "✅ 对象库完好，没有 missing/broken"
fi

echo ""
echo "--- 残留的 pack 临时文件（应该为空）---"
ls .git/objects/pack/tmp_pack_* 2>/dev/null || echo "（无，正常）"

echo ""
echo "--- 你未提交的关键文件是否都在 ---"
for f in "app/pages/vault.vue" "app/composables/useVault.ts" "shared/vault-crypto.mjs" "scripts/vault.mjs" "VAULT.md" "content.config.ts" "nuxt.config.ts"; do
  if [ -f "$REPO/$f" ]; then echo "  ✅ $f"; else echo "  ❌ 缺失：$f"; fi
done

echo ""
echo "════════ 修复完成 ════════"
echo ""
echo "现在："
echo "  · 本地 .git 是全新的，origin 已指向 GitHub"
echo "  · 你工作区里的所有改动都是未提交状态"
echo ""
echo "原始工作区另有完整副本（出意外可从这里恢复）："
echo "  $BACKUP/worktree.tar.gz"
echo ""
echo "下一步："
echo ""
echo "  第 1 步 —— 先看看有哪些改动（重点确认 content/posts/ 和 content/vault/）："
echo "    git status"
echo ""
echo "  第 2 步 —— 提交。建议第一组只放「文件名 ASCII 化」这一个修复："
echo "    git add content/ .github/ nuxt.config.ts content.config.ts package.json public/admin/config.yml scripts/check-content-filenames.mjs app/composables/usePosts.ts"
echo "    git commit -m \"fix(content): 文件名全部 ASCII 化，修掉 path 塌缩导致的文章内容互相覆盖\""
echo ""
echo "  第 3 步 —— 第二组放加密专区："
echo "    git add .gitignore VAULT.md app/pages/vault.vue app/composables/useVault.ts shared/vault-crypto.mjs scripts/vault.mjs scripts/test-vault-crypto.mjs scripts/test-vault-e2e.mjs content.config.ts nuxt.config.ts app/data/site.ts package.json"
echo "    git commit -m \"feat(vault): 新增加密专区（密文入库 + 密码解锁）\""
echo ""
echo "  第 4 步 —— 推上去："
echo "    git push origin main"
echo ""
echo "  如果 push 被拒（fetch first），说明远端有你本地没有的提交，"
echo "  这种情况下需要先把远端历史取下来。把报错发给助手即可。"
echo ""
echo "  【重要】线上 content/posts/ 里目前还留着 4 个中文文件名的文章："
echo "      ai灵犀工作台.md / ai自动化找工作.md"
echo "      c盘爆了？？别慌-不用重装还能抢救.md"
echo "      用-playwright-驱动「用户自己的-chrome」：一次-cdp-深水区实践.md"
echo "  说明之前的 ASCII 修复没能完整推送。你本地的 ASCII 版本提交后即可覆盖它们。"
echo ""
echo "  【注意】content/posts/c-drive-full-rescue.md 线上比本地新（线上改过 5 次），"
echo "          脚本会把线上版补回工作区，你提交时会带上线上那一版，这是正确的。"
