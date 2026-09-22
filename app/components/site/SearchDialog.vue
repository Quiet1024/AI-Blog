<script setup lang="ts">
/**
 * 搜索弹窗：Cmd/Ctrl+K 或 "/" 唤起。
 *
 * 数据来自预渲染的静态索引 /search-index.json（server/routes/search-index.json.get.ts），
 * 在浏览器端打分排序 —— 所以纯静态托管也能搜，且输入即出结果。
 * 索引取不到时（例如索引文件缺失）自动回退到服务端接口 /api/search。
 */
interface Hit {
  title: string
  path: string
  description: string
  tags: string[]
  snippet: string
  score: number
}

interface IndexItem {
  title: string
  path: string
  description: string
  tags: string[]
  text: string
  date: string
}

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const query = ref('')
const hits = ref<Hit[]>([])
const loading = ref(false)
const active = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

// ---------- 静态索引 ----------
let indexPromise: Promise<IndexItem[]> | null = null

function loadIndex(): Promise<IndexItem[]> {
  if (!indexPromise) {
    indexPromise = $fetch<IndexItem[]>('/search-index.json')
      .then((data) => (Array.isArray(data) ? data : []))
      .catch(() => {
        indexPromise = null // 允许下次重试
        return [] as IndexItem[]
      })
  }
  return indexPromise
}

function makeSnippet(text: string, q: string, radius = 48) {
  const at = text.toLowerCase().indexOf(q.toLowerCase())
  if (at < 0) return text.slice(0, radius * 2)
  const start = Math.max(0, at - radius)
  return (start > 0 ? '…' : '') + text.slice(start, at + q.length + radius) + '…'
}

/** 本地打分：标题 8 / 标签 4 / 摘要 3 / 正文 1，与服务端接口口径一致 */
function searchIndex(items: IndexItem[], q: string): Hit[] {
  const lower = q.toLowerCase()
  const out: Hit[] = []
  for (const it of items) {
    let score = 0
    if (it.title.toLowerCase().includes(lower)) score += 8
    if (it.tags.some((t) => t.toLowerCase().includes(lower))) score += 4
    if (it.description.toLowerCase().includes(lower)) score += 3
    if (it.text.toLowerCase().includes(lower)) score += 1
    if (!score) continue
    out.push({
      title: it.title,
      path: it.path,
      description: it.description,
      tags: it.tags,
      score,
      snippet: makeSnippet(it.description || it.text, q),
    })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, 10)
}

async function run(q: string) {
  if (!q.trim()) {
    hits.value = []
    return
  }
  loading.value = true
  try {
    const items = await loadIndex()
    if (items.length) {
      hits.value = searchIndex(items, q)
    } else {
      // 索引不可用 → 回退到服务端接口
      const res = await $fetch<{ results: Hit[] }>('/api/search', { params: { q } })
      hits.value = res.results || []
    }
    active.value = 0
  } catch {
    hits.value = []
  } finally {
    loading.value = false
  }
}

watch(query, (v) => {
  clearTimeout(timer)
  // 索引在本地，打分是纯内存计算，防抖可以给得很短
  timer = setTimeout(() => run(v), 60)
})

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      query.value = ''
      hits.value = []
      loadIndex() // 打开就开始拉索引，第一次输入就不用等网络
      await nextTick()
      inputRef.value?.focus()
    }
  },
)

function go() {
  const hit = hits.value[active.value]
  if (!hit) return
  emit('update:modelValue', false)
  navigateTo(hit.path)
}

function move(delta: number) {
  if (!hits.value.length) return
  active.value = (active.value + delta + hits.value.length) % hits.value.length
}

// 全局快捷键
onMounted(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      emit('update:modelValue', !props.modelValue)
    }
    const tag = (e.target as HTMLElement)?.tagName
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault()
      emit('update:modelValue', true)
    }
  }
  window.addEventListener('keydown', onKey)
  onUnmounted(() => window.removeEventListener('keydown', onKey))
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="props.modelValue"
        class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
        @click.self="emit('update:modelValue', false)"
      >
        <div
          class="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[color:var(--page-bg)] shadow-2xl"
          @keydown.up.prevent="move(-1)"
          @keydown.down.prevent="move(1)"
          @keydown.enter.prevent="go()"
          @keydown.esc="emit('update:modelValue', false)"
        >
          <div class="flex items-center gap-3 border-b border-[var(--hairline)] px-4">
            <AppIcon
              name="search"
              :size="18"
              class="text-[color-mix(in_oklab,var(--page-fg)_45%,transparent)]"
            />
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              placeholder="搜索文章标题、正文、标签…"
              class="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[color-mix(in_oklab,var(--page-fg)_40%,transparent)]"
            />
            <span
              v-if="loading"
              class="text-xs text-[color-mix(in_oklab,var(--page-fg)_45%,transparent)]"
              >搜索中</span
            >
            <button
              class="rounded px-1.5 text-xs text-[color-mix(in_oklab,var(--page-fg)_45%,transparent)]"
              @click="emit('update:modelValue', false)"
            >
              Esc
            </button>
          </div>

          <div class="max-h-[52vh] overflow-y-auto p-2">
            <p
              v-if="query && !loading && !hits.length"
              class="px-3 py-8 text-center text-sm text-[color-mix(in_oklab,var(--page-fg)_50%,transparent)]"
            >
              没有找到相关内容
            </p>
            <p
              v-if="!query"
              class="px-3 py-8 text-center text-sm text-[color-mix(in_oklab,var(--page-fg)_45%,transparent)]"
            >
              输入关键词开始搜索
            </p>

            <button
              v-for="(hit, i) in hits"
              :key="hit.path"
              class="flex w-full flex-col gap-1 rounded-xl px-3 py-3 text-left transition"
              :class="
                i === active
                  ? 'bg-[color-mix(in_oklab,var(--page-fg)_9%,transparent)]'
                  : 'hover:bg-[color-mix(in_oklab,var(--page-fg)_5%,transparent)]'
              "
              @mouseenter="active = i"
              @click="go()"
            >
              <span class="text-sm font-medium">{{ hit.title }}</span>
              <span
                class="line-clamp-2 text-xs text-[color-mix(in_oklab,var(--page-fg)_55%,transparent)]"
                >{{ hit.snippet || hit.description }}</span
              >
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
