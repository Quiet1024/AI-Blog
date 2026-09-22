<script setup lang="ts">
import { collectTags, fetchPosts, paginate } from '~/composables/usePosts'

const route = useRoute()
const all = await fetchPosts()
const tags = collectTags(all)

const activeTag = computed(() => (route.query.tag as string) || '')
const page = computed(() => Number(route.query.page || 1))

const filtered = computed(() =>
  activeTag.value ? all.filter((p) => p.tags.includes(activeTag.value)) : all,
)

const pageInfo = computed(() => paginate(filtered.value, page.value, 9))

function setTag(tag: string) {
  navigateTo({ path: '/blog', query: tag ? { tag } : {} })
}

useSeoMeta({
  title: '文章',
  description: '所有文章，按时间倒序排列。',
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 py-14 sm:px-8">
    <header class="border-b border-[var(--hairline)] pb-8">
      <h1 class="font-serif text-4xl font-bold tracking-tight sm:text-5xl">文章</h1>
      <p
        class="mt-3 text-sm text-[color-mix(in_oklab,var(--page-fg)_60%,transparent)]"
      >
        共 {{ all.length }} 篇 · 当前筛选：{{ activeTag || '全部' }}
      </p>
    </header>

    <!-- 标签筛选 -->
    <div class="flex flex-wrap gap-2 py-6">
      <button
        class="rounded-full border px-3 py-1 text-xs transition"
        :class="
          !activeTag
            ? 'border-transparent bg-[color:var(--color-ink-900)] text-white dark:bg-[color:var(--color-ink-100)] dark:text-[color:var(--color-ink-900)]'
            : 'border-[var(--hairline)] text-[color-mix(in_oklab,var(--page-fg)_62%,transparent)]'
        "
        @click="setTag('')"
      >
        全部
      </button>
      <button
        v-for="t in tags"
        :key="t.name"
        class="rounded-full border px-3 py-1 text-xs transition"
        :class="
          activeTag === t.name
            ? 'border-transparent bg-[color:var(--color-ink-900)] text-white dark:bg-[color:var(--color-ink-100)] dark:text-[color:var(--color-ink-900)]'
            : 'border-[var(--hairline)] text-[color-mix(in_oklab,var(--page-fg)_62%,transparent)] hover:text-[color:var(--page-fg)]'
        "
        @click="setTag(t.name)"
      >
        #{{ t.name }}
        <span class="opacity-50">{{ t.count }}</span>
      </button>
    </div>

    <!-- 列表 -->
    <div class="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      <ArticleCard v-for="p in pageInfo.items" :key="p.id" :post="p" />
    </div>

    <p
      v-if="!pageInfo.items.length"
      class="py-20 text-center text-sm text-[color-mix(in_oklab,var(--page-fg)_50%,transparent)]"
    >
      这个话题下还没有文章。
    </p>

    <!-- 分页 -->
    <nav
      v-if="pageInfo.total > 1"
      class="mt-16 flex items-center justify-center gap-4 border-t border-[var(--hairline)] pt-8 text-sm"
    >
      <NuxtLink
        v-if="pageInfo.hasPrev"
        :to="{ path: '/blog', query: { ...route.query, page: pageInfo.current - 1 } }"
        class="inline-flex items-center gap-1.5 text-[color-mix(in_oklab,var(--page-fg)_65%,transparent)] hover:text-[color:var(--page-fg)]"
      >
        上一页
      </NuxtLink>
      <span class="text-[color-mix(in_oklab,var(--page-fg)_45%,transparent)]">
        {{ pageInfo.current }} / {{ pageInfo.total }}
      </span>
      <NuxtLink
        v-if="pageInfo.hasNext"
        :to="{ path: '/blog', query: { ...route.query, page: pageInfo.current + 1 } }"
        class="inline-flex items-center gap-1.5 text-[color-mix(in_oklab,var(--page-fg)_65%,transparent)] hover:text-[color:var(--page-fg)]"
      >
        下一页
      </NuxtLink>
    </nav>
  </div>
</template>
