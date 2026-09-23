<script setup lang="ts">
import type { PostItem } from '~/composables/usePosts'
import { fetchPosts, formatDate, readingTime } from '~/composables/usePosts'

const route = useRoute()

const { data: post } = await useAsyncData(`post:${route.path}`, () =>
  queryCollection('posts').path(route.path).first(),
)

if (!post.value) {
  throw createError({ statusCode: 404, statusMessage: '文章不存在', fatal: true })
}

const all = await fetchPosts()
const index = computed(() => all.findIndex((p) => p.path === post.value?.path))
const newer = computed(() => (index.value > 0 ? all[index.value - 1] : undefined))
const older = computed(() =>
  index.value >= 0 ? all[index.value + 1] : undefined,
)

const p = computed(() => post.value as unknown as PostItem)

const toc = computed(() => {
  const body = p.value.body as { toc?: { links?: unknown[] } } | undefined
  return (body?.toc?.links || []) as {
    id: string
    text: string
    depth: number
    children?: never[]
  }[]
})

useSeoMeta({
  title: p.value.title,
  description: p.value.description,
  ogTitle: p.value.title,
  ogDescription: p.value.description,
  ogType: 'article',
  ogImage: p.value.cover || '/og-default.png',
  articlePublishedTime: p.value.date,
  twitterCard: 'summary_large_image',
  twitterImage: p.value.cover || '/og-default.png',
})
</script>

<template>
  <article class="mx-auto max-w-6xl px-5 py-12 sm:px-8">
    <!-- 刊头 -->
    <header class="mx-auto max-w-3xl">
      <div
        class="flex flex-wrap items-center gap-2 text-[11px] tracking-wide text-[color-mix(in_oklab,var(--page-fg)_50%,transparent)] uppercase"
      >
        <time>{{ formatDate(p.date) }}</time>
        <span class="opacity-40">·</span>
        <span>{{ readingTime(p.body) }}</span>
        <span v-if="p.author" class="opacity-40">·</span>
        <span v-if="p.author">{{ p.author }}</span>
      </div>

      <h1
        class="mt-4 font-serif text-3xl leading-tight font-bold tracking-tight sm:text-5xl"
      >
        {{ p.title }}
      </h1>

      <p
        v-if="p.description"
        class="mt-5 border-l-2 border-[color:var(--color-accent-500)] pl-4 text-base leading-relaxed text-[color-mix(in_oklab,var(--page-fg)_65%,transparent)]"
      >
        {{ p.description }}
      </p>

      <div class="mt-6 flex flex-wrap gap-1.5">
        <TagPill v-for="t in p.tags" :key="t" :name="t" />
      </div>
    </header>

    <!-- 封面 -->
    <div class="mx-auto mt-10 max-w-4xl">
      <NuxtImg
        v-if="p.cover"
        :src="p.cover"
        :alt="p.title"
        class="h-64 w-full rounded-2xl object-cover sm:h-[26rem]"
        sizes="sm:100vw md:900px"
      />
      <CoverArt
        v-else
        :title="p.title"
        :seed="p.path"
        :tags="p.tags"
        :kicker="p.kicker"
        height="16rem"
        class="sm:h-[22rem]!"
      />
    </div>

    <!-- 正文 + 目录 -->
    <div
      class="mx-auto mt-12 grid max-w-4xl gap-12 lg:grid-cols-[minmax(0,1fr)_11rem] xl:grid-cols-[minmax(0,1fr)_13rem]"
    >
      <div class="prose-magazine min-w-0" :class="p.serif ? 'font-serif' : ''">
        <ContentRenderer :value="p" />
      </div>

      <aside class="hidden lg:block">
        <div class="sticky top-24">
          <TocNav :links="toc" />
        </div>
      </aside>
    </div>

    <!-- 上下篇 -->
    <nav
      class="mx-auto mt-20 grid max-w-4xl gap-4 border-t border-[var(--hairline)] pt-10 sm:grid-cols-2"
    >
      <NuxtLink
        v-if="older"
        :to="older.path"
        class="group rounded-xl border border-[var(--hairline)] p-5 transition hover:border-[color:var(--color-accent-500)]"
      >
        <span
          class="text-[11px] tracking-widest text-[color-mix(in_oklab,var(--page-fg)_45%,transparent)] uppercase"
          >上一篇</span
        >
        <p class="mt-2 font-serif text-base font-bold leading-snug">
          {{ older.title }}
        </p>
      </NuxtLink>
      <NuxtLink
        v-if="newer"
        :to="newer.path"
        class="group rounded-xl border border-[var(--hairline)] p-5 text-right transition hover:border-[color:var(--color-accent-500)] sm:col-start-2"
      >
        <span
          class="text-[11px] tracking-widest text-[color-mix(in_oklab,var(--page-fg)_45%,transparent)] uppercase"
          >下一篇</span
        >
        <p class="mt-2 font-serif text-base font-bold leading-snug">
          {{ newer.title }}
        </p>
      </NuxtLink>
    </nav>
  </article>
</template>
