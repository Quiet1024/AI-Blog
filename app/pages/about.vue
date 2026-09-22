<script setup lang="ts">
import { fetchPosts } from '~/composables/usePosts'
import { siteConfig } from '~/data/site'

const posts = await fetchPosts()

// 社交链接里有站内路径（RSS），普通 <a href> 不会自动带 baseURL，手动拼
const withBase = useBasePath()

useSeoMeta({
  title: '关于',
  description: siteConfig.author.bio,
})
</script>

<template>
  <div class="mx-auto max-w-3xl px-5 py-14 sm:px-8">
    <header class="border-b border-[var(--hairline)] pb-10">
      <h1 class="font-serif text-4xl font-bold tracking-tight sm:text-5xl">关于</h1>
    </header>

    <div class="mt-10 flex flex-col gap-8 sm:flex-row sm:items-start">
      <div
        class="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--page-fg)_8%,transparent)]"
      >
        <NuxtImg
          v-if="siteConfig.author.avatar"
          :src="siteConfig.author.avatar"
          :alt="siteConfig.author.name"
          class="h-full w-full object-cover"
          width="96"
          height="96"
        />
      </div>

      <div class="prose-magazine">
        <p class="text-lg">{{ siteConfig.author.bio }}</p>
        <p>
          这个站点是用 Nuxt 4 + Nuxt Content 搭的，文章都是本地 Markdown 文件，
          写完直接 git push 就发布。没有后台，没有数据库，加载快，也搬得走。
        </p>
        <p>
          目前写了 {{ posts.length }} 篇文章。如果你想聊点什么，可以发邮件到
          <a :href="`mailto:${siteConfig.author.email}`">{{ siteConfig.author.email }}</a>。
        </p>
      </div>
    </div>

    <div class="mt-14 border-t border-[var(--hairline)] pt-8">
      <p
        class="mb-4 text-xs font-medium tracking-[0.2em] text-[color-mix(in_oklab,var(--page-fg)_45%,transparent)] uppercase"
      >
        在别处找到我
      </p>
      <div class="flex flex-wrap gap-2">
        <a
          v-for="s in siteConfig.social"
          :key="s.label"
          :href="withBase(s.to)"
          class="inline-flex items-center gap-2 rounded-full border border-[var(--hairline)] px-3.5 py-2 text-sm transition hover:border-[color:var(--color-accent-500)]"
          target="_blank"
          rel="noopener"
        >
          <AppIcon :name="s.icon" :size="15" />
          {{ s.label }}
        </a>
      </div>
    </div>
  </div>
</template>
