<script setup lang="ts">
/**
 * 加密专区 /vault
 *
 * 三种状态：
 *   ① 没有条目      → 提示去跑 vault.mjs
 *   ② 未解锁        → 密码框（只显示条目数量，不显示标题）
 *   ③ 已解锁        → 条目列表 + 正文阅读
 *
 * ⚠️ 「完全隐藏」是本次确认的决策之一：本页不进首页/文章列表/标签云/
 *    搜索/RSS/sitemap，导航里也用不显眼的位置。见 useVault.ts 的说明。
 */
import { marked } from 'marked'
import {
  collectVaultTags,
  decryptNote,
  fetchVaultEntries,
  isUnlocked,
  lockVault,
  unlockVault,
  useVaultState,
  type VaultEntry,
} from '~/composables/useVault'
import { formatDate } from '~/composables/usePosts'

const entries = await fetchVaultEntries()
const tags = collectVaultTags(entries)

const { unlocked, markUnlocked, markLocked } = useVaultState()
// 刷新后内存里的密码没了 —— 同步一次真实状态
unlocked.value = isUnlocked()

/* ── 解锁表单 ─────────────────────────────────────── */
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submitUnlock() {
  if (busy.value || !password.value) return
  busy.value = true
  error.value = ''
  try {
    const ok = await unlockVault(entries, password.value)
    if (ok) {
      markUnlocked()
      password.value = ''
      // 解锁后自动打开第一篇
      if (entries.length && !activeId.value) activeId.value = entries[0].id
    } else {
      error.value = '密码不对。请再试一次。'
    }
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : '解锁失败，请检查浏览器是否支持加密 API。'
  } finally {
    busy.value = false
  }
}

/* ── 阅读 ─────────────────────────────────────────── */
const activeId = ref('')
const active = computed(() => entries.find((e) => e.id === activeId.value))

const plainBody = ref('')
const bodyError = ref('')
const loadingBody = ref(false)

/** 去掉 frontmatter，正文才拿去渲染 */
function stripFrontmatter(md: string) {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

watch(
  () => [activeId.value, unlocked.value] as const,
  async ([id, isOpen]) => {
    if (!id || !isOpen) {
      plainBody.value = ''
      return
    }
    const entry = entries.find((e) => e.id === id)
    if (!entry) return
    loadingBody.value = true
    bodyError.value = ''
    try {
      const raw = await decryptNote(entry)
      plainBody.value = stripFrontmatter(raw)
    } catch (err) {
      bodyError.value = err instanceof Error ? err.message : '解密失败'
      plainBody.value = ''
    } finally {
      loadingBody.value = false
    }
  },
  { immediate: true },
)

const renderedHtml = computed(() =>
  plainBody.value ? (marked.parse(plainBody.value, { async: false }) as string) : '',
)

function lock() {
  markLocked()
  activeId.value = ''
  plainBody.value = ''
  error.value = ''
}

/** 条目标题在未解锁时是否可见：本次决策为「完全隐藏」，所以锁定态一律打码 */
function displayTitle(e: VaultEntry, i: number) {
  return unlocked.value ? e.title : `加密条目 ${String(i + 1).padStart(2, '0')}`
}

useSeoMeta({
  title: '加密专区',
  // 不希望被搜索引擎收录：robots 交给 nuxt.config 的 routeRules 统一处理
  description: '私密笔记。需要密码解锁。',
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 py-14 sm:px-8">
    <!-- 刊头 -->
    <header class="border-b border-[var(--hairline)] pb-8">
      <div class="flex flex-wrap items-center gap-3">
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] px-3 py-1 text-[11px] tracking-wide text-[color-mix(in_oklab,var(--page-fg)_62%,transparent)] uppercase"
        >
          <svg viewBox="0 0 24 24" class="size-3.5" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5m3 8H9V7a3 3 0 1 1 6 0z"
            />
          </svg>
          加密专区
        </span>
        <span
          v-if="unlocked"
          class="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-accent-500)]/12 px-3 py-1 text-[11px] font-medium text-[color:var(--color-accent-700)] dark:text-[color:var(--color-accent-300)]"
        >
          已解锁 · 本次访问有效
          <button class="ml-1 underline underline-offset-2 hover:no-underline" @click="lock">
            锁定
          </button>
        </span>
      </div>

      <h1 class="mt-4 font-serif text-4xl font-bold tracking-tight sm:text-5xl">加密专区</h1>
      <p class="mt-3 max-w-2xl text-sm text-[color-mix(in_oklab,var(--page-fg)_60%,transparent)]">
        这里的笔记在仓库里是密文，只有输入密码才能在本机解密阅读。
      </p>
    </header>

    <!-- ① 没有条目 -->
    <div v-if="!entries.length" class="py-20 text-center">
      <p class="font-serif text-lg">专区里还没有笔记。</p>
      <p class="mt-3 text-sm text-[color-mix(in_oklab,var(--page-fg)_55%,transparent)]">
        在本机运行下面的命令建一篇，再加密进仓库：
      </p>
      <pre
        class="mx-auto mt-5 w-fit rounded-xl border border-[var(--hairline)] bg-[color:var(--color-ink-950)] px-5 py-4 text-left text-[13px] leading-relaxed text-[color:var(--color-ink-100)]"
      ><code>node scripts/vault.mjs new 我的笔记
node scripts/vault.mjs lock</code></pre>
    </div>

    <!-- ② 未解锁 -->
    <div v-else-if="!unlocked" class="mx-auto max-w-md py-16">
      <form
        class="rounded-2xl border border-[var(--hairline)] p-7 sm:p-8"
        @submit.prevent="submitUnlock"
      >
        <div class="flex items-center gap-2.5">
          <svg viewBox="0 0 24 24" class="size-5 text-[color:var(--color-accent-600)]" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5m3 8H9V7a3 3 0 1 1 6 0z"
            />
          </svg>
          <h2 class="font-serif text-xl font-bold">输入密码解锁</h2>
        </div>

        <p class="mt-3 text-sm text-[color-mix(in_oklab,var(--page-fg)_60%,transparent)]">
          专区里有 <strong class="text-[color:var(--page-fg)]">{{ entries.length }}</strong> 篇笔记。
          解锁后本次访问内无需重复输入。
        </p>

        <label class="mt-6 block">
          <span class="sr-only">密码</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="密码"
            class="w-full rounded-lg border border-[var(--hairline)] bg-transparent px-4 py-3 text-base outline-none transition focus:border-[color:var(--color-accent-500)]"
            :disabled="busy"
          />
        </label>

        <p
          v-if="error"
          class="mt-3 rounded-lg border border-red-300/60 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300"
          role="alert"
        >
          {{ error }}
        </p>

        <button
          type="submit"
          class="mt-5 w-full rounded-lg bg-[color:var(--color-ink-900)] px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-[color:var(--color-ink-100)] dark:text-[color:var(--color-ink-900)]"
          :disabled="busy || !password"
        >
          {{ busy ? '正在解锁…' : '解锁' }}
        </button>

        <p class="mt-4 text-xs leading-relaxed text-[color-mix(in_oklab,var(--page-fg)_45%,transparent)]">
          解密完全在你的浏览器里完成，密码不会发送到任何服务器。
        </p>
      </form>
    </div>

    <!-- ③ 已解锁 -->
    <div v-else class="mt-8 grid gap-10 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <!-- 条目列表 -->
      <aside class="lg:sticky lg:top-24 lg:self-start">
        <div class="flex flex-wrap gap-1.5 pb-4">
          <span
            v-for="t in tags"
            :key="t.name"
            class="rounded-full border border-[var(--hairline)] px-2.5 py-0.5 text-[11px] text-[color-mix(in_oklab,var(--page-fg)_58%,transparent)]"
            >#{{ t.name }}</span
          >
        </div>

        <nav class="space-y-1.5">
          <button
            v-for="(e, i) in entries"
            :key="e.id"
            class="w-full rounded-xl border px-4 py-3 text-left transition"
            :class="
              e.id === activeId
                ? 'border-[color:var(--color-accent-500)] bg-[color:var(--color-accent-500)]/8'
                : 'border-[var(--hairline)] hover:border-[color:var(--color-accent-500)]/60'
            "
            @click="activeId = e.id"
          >
            <p class="font-serif text-[15px] leading-snug font-bold">
              {{ displayTitle(e, i) }}
            </p>
            <p
              class="mt-1 text-[11px] text-[color-mix(in_oklab,var(--page-fg)_48%,transparent)]"
            >
              {{ e.date ? formatDate(e.date) : '无日期' }}
            </p>
          </button>
        </nav>
      </aside>

      <!-- 正文 -->
      <section class="min-w-0">
        <template v-if="active">
          <header class="border-b border-[var(--hairline)] pb-6">
            <h2 class="font-serif text-3xl font-bold tracking-tight">{{ active.title }}</h2>
            <div
              class="mt-3 flex flex-wrap items-center gap-2 text-[11px] tracking-wide text-[color-mix(in_oklab,var(--page-fg)_50%,transparent)] uppercase"
            >
              <time>{{ active.date ? formatDate(active.date) : '无日期' }}</time>
              <template v-if="active.tags.length">
                <span class="opacity-40">·</span>
                <span>{{ active.tags.join(' / ') }}</span>
              </template>
            </div>
          </header>

          <p
            v-if="loadingBody"
            class="py-12 text-sm text-[color-mix(in_oklab,var(--page-fg)_50%,transparent)]"
          >
            正在解密…
          </p>
          <p v-else-if="bodyError" class="py-12 text-sm text-red-600 dark:text-red-400">
            {{ bodyError }}
          </p>
          <!-- eslint-disable-next-line vue/no-v-html -- 内容来自本机加密文件，解密后由 marked 渲染 -->
          <div v-else class="prose-magazine mt-8 font-serif" v-html="renderedHtml" />
        </template>

        <p
          v-else
          class="py-16 text-center text-sm text-[color-mix(in_oklab,var(--page-fg)_50%,transparent)]"
        >
          从左边选一篇开始阅读。
        </p>
      </section>
    </div>
  </div>
</template>
