<script setup lang="ts">
import { collectTags, fetchPosts } from '~/composables/usePosts'

const posts = await fetchPosts()
const tags = collectTags(posts)

useSeoMeta({ title: '所有话题', description: '按话题浏览全部文章。' })
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 py-14 sm:px-8">
    <header class="border-b border-[var(--hairline)] pb-8">
      <h1 class="font-serif text-4xl font-bold tracking-tight sm:text-5xl">话题</h1>
      <p
        class="mt-3 text-sm text-[color-mix(in_oklab,var(--page-fg)_60%,transparent)]"
      >
        共 {{ tags.length }} 个话题
      </p>
    </header>

    <div class="flex flex-wrap gap-2.5 py-10">
      <TagPill v-for="t in tags" :key="t.name" :name="t.name" :count="t.count" />
    </div>
  </div>
</template>
