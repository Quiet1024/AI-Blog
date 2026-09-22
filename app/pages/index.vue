<script setup lang="ts">
import { collectTags, fetchHomePosts, fetchProjects } from '~/composables/usePosts'
import { siteConfig } from '~/data/site'

const { posts, featured, rest } = await fetchHomePosts()
const projects = await fetchProjects()
const tags = collectTags(posts).slice(0, 10)

useSeoMeta({
  title: `${siteConfig.name} · ${siteConfig.tagline}`,
  description: siteConfig.description,
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 sm:px-8">
    <!-- Hero：杂志刊头 -->
    <section class="border-b border-[var(--hairline)] py-16 sm:py-24">
      <p
        class="mb-5 inline-flex items-center gap-2 text-xs font-medium tracking-[0.25em] text-[color:var(--color-accent-600)] uppercase dark:text-[color:var(--color-accent-300)]"
      >
        <span class="inline-block h-px w-8 bg-current" />
        {{ siteConfig.shortName }} Journal
      </p>
      <h1
        class="max-w-3xl font-serif text-4xl leading-[1.1] font-bold tracking-tight sm:text-6xl"
      >
        {{ siteConfig.tagline }}
      </h1>
      <p
        class="mt-6 max-w-xl text-base leading-relaxed text-[color-mix(in_oklab,var(--page-fg)_62%,transparent)] sm:text-lg"
      >
        {{ siteConfig.description }}
      </p>
      <div class="mt-8 flex flex-wrap items-center gap-3">
        <NuxtLink
          to="/blog"
          class="inline-flex items-center gap-2 rounded-full bg-[color:var(--color-ink-900)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-85 dark:bg-[color:var(--color-ink-100)] dark:text-[color:var(--color-ink-900)]"
        >
          开始阅读
          <AppIcon name="arrowRight" :size="16" />
        </NuxtLink>
        <NuxtLink
          to="/projects"
          class="inline-flex items-center gap-2 rounded-full border border-[var(--hairline)] px-5 py-2.5 text-sm transition hover:bg-[color-mix(in_oklab,var(--page-fg)_6%,transparent)]"
        >
          看看作品
        </NuxtLink>
      </div>
    </section>

    <!-- 头条 -->
    <section v-if="featured" class="py-14">
      <div
        class="mb-6 flex items-baseline justify-between border-b border-[var(--hairline)] pb-3"
      >
        <h2 class="font-serif text-sm font-bold tracking-[0.2em] uppercase">头条</h2>
        <NuxtLink
          to="/blog"
          class="text-xs text-[color-mix(in_oklab,var(--page-fg)_55%,transparent)] hover:text-[color:var(--page-fg)]"
          >全部文章 →</NuxtLink
        >
      </div>

      <div class="grid gap-8 md:grid-cols-[1.15fr_1fr] md:items-center">
        <NuxtLink :to="featured.path" class="block">
          <NuxtImg
            v-if="featured.cover"
            :src="featured.cover"
            :alt="featured.title"
            class="h-72 w-full rounded-2xl object-cover sm:h-96"
            sizes="sm:100vw md:600px"
          />
          <CoverArt
            v-else
            :title="featured.title"
            :seed="featured.path"
            height="22rem"
            label="Featured"
            class="sm:h-96!"
          />
        </NuxtLink>
        <div>
          <ArticleCard :post="featured" variant="large" />
        </div>
      </div>
    </section>

    <!-- 文章网格 -->
    <section class="py-6">
      <div
        class="mb-8 flex items-baseline justify-between border-b border-[var(--hairline)] pb-3"
      >
        <h2 class="font-serif text-sm font-bold tracking-[0.2em] uppercase">最近写</h2>
        <span class="text-xs text-[color-mix(in_oklab,var(--page-fg)_45%,transparent)]"
          >共 {{ posts.length }} 篇</span
        >
      </div>

      <div class="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        <ArticleCard v-for="p in rest.slice(0, 6)" :key="p.id" :post="p" />
      </div>
    </section>

    <!-- 作品集 -->
    <section v-if="projects.length" class="py-16">
      <div
        class="mb-8 flex items-baseline justify-between border-b border-[var(--hairline)] pb-3"
      >
        <h2 class="font-serif text-sm font-bold tracking-[0.2em] uppercase">作品</h2>
        <NuxtLink
          to="/projects"
          class="text-xs text-[color-mix(in_oklab,var(--page-fg)_55%,transparent)] hover:text-[color:var(--page-fg)]"
          >全部项目 →</NuxtLink
        >
      </div>

      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="p in projects.slice(0, 3)"
          :key="p.name"
          :to="p.link || '/projects'"
          class="group rounded-xl border border-[var(--hairline)] p-5 transition hover:border-[color:var(--color-accent-500)]"
          :target="p.link ? '_blank' : undefined"
        >
          <div class="flex items-start justify-between gap-3">
            <h3 class="font-serif text-lg font-bold">{{ p.name }}</h3>
            <span
              class="text-xs text-[color-mix(in_oklab,var(--page-fg)_40%,transparent)]"
              >{{ p.year }}</span
            >
          </div>
          <p
            class="mt-2 text-sm leading-relaxed text-[color-mix(in_oklab,var(--page-fg)_60%,transparent)]"
          >
            {{ p.summary }}
          </p>
          <div class="mt-4 flex flex-wrap gap-1.5">
            <span
              v-for="s in p.stack"
              :key="s"
              class="rounded-full bg-[color-mix(in_oklab,var(--page-fg)_7%,transparent)] px-2 py-0.5 text-[11px]"
              >{{ s }}</span
            >
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- 标签云 -->
    <section v-if="tags.length" class="pb-20">
      <div class="mb-5 border-b border-[var(--hairline)] pb-3">
        <h2 class="font-serif text-sm font-bold tracking-[0.2em] uppercase">话题</h2>
      </div>
      <div class="flex flex-wrap gap-2">
        <TagPill v-for="t in tags" :key="t.name" :name="t.name" :count="t.count" />
      </div>
    </section>
  </div>
</template>
