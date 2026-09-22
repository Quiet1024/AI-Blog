<script setup lang="ts">
import { fetchPosts } from '~/composables/usePosts'

const route = useRoute()
const tag = computed(() => String(route.params.tag || ''))

const all = await fetchPosts()
const posts = computed(() => all.filter((p) => p.tags.includes(tag.value)))

useSeoMeta({
  title: `#${tag.value}`,
  description: `话题「${tag.value}」下的全部文章。`,
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 py-14 sm:px-8">
    <header class="border-b border-[var(--hairline)] pb-8">
      <p class="text-xs tracking-[0.25em] text-[color:var(--color-accent-600)] uppercase dark:text-[color:var(--color-accent-300)]">
        话题
      </p>
      <h1 class="mt-2 font-serif text-4xl font-bold tracking-tight sm:text-5xl">
        #{{ tag }}
      </h1>
      <p
        class="mt-3 text-sm text-[color-mix(in_oklab,var(--page-fg)_60%,transparent)]"
      >
        {{ posts.length }} 篇文章
      </p>
    </header>

    <div class="grid gap-x-8 gap-y-12 pt-10 sm:grid-cols-2 lg:grid-cols-3">
      <ArticleCard v-for="p in posts" :key="p.id" :post="p" />
    </div>

    <p
      v-if="!posts.length"
      class="py-20 text-center text-sm text-[color-mix(in_oklab,var(--page-fg)_50%,transparent)]"
    >
      这个话题下还没有文章。
    </p>
  </div>
</template>
