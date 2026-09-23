<script setup lang="ts">
import { fetchProjects } from '~/composables/usePosts'

const projects = await fetchProjects()

useSeoMeta({
  title: '作品',
  description: '做过的一些项目与设计。',
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 py-14 sm:px-8">
    <header class="border-b border-[var(--hairline)] pb-8">
      <h1 class="font-serif text-4xl font-bold tracking-tight sm:text-5xl">作品</h1>
      <p
        class="mt-3 max-w-xl text-sm leading-relaxed text-[color-mix(in_oklab,var(--page-fg)_60%,transparent)]"
      >
        一些做过的东西：产品设计、全栈开发、还有些想法写着玩的实验。
      </p>
    </header>

    <div class="grid gap-8 pt-12 sm:grid-cols-2">
      <component
        :is="p.link ? 'a' : 'div'"
        v-for="(p, i) in projects"
        :key="p.name"
        :href="p.link"
        :target="p.link ? '_blank' : undefined"
        rel="noopener"
        class="group overflow-hidden rounded-2xl border border-[var(--hairline)] transition hover:border-[color:var(--color-accent-500)]"
      >
        <ProjectCover
          v-if="!p.cover"
          :name="p.name"
          :index="i + 1"
          :year="p.year"
          :accent-key="p.accent"
          height="14rem"
          radius="0"
        />
        <NuxtImg
          v-else
          :src="p.cover"
          :alt="p.name"
          class="h-56 w-full object-cover"
          sizes="sm:100vw md:600px"
        />

        <div class="p-6">
          <div class="flex items-start justify-between gap-4">
            <h2 class="font-serif text-xl font-bold">{{ p.name }}</h2>
            <span
              v-if="p.role"
              class="shrink-0 text-xs text-[color-mix(in_oklab,var(--page-fg)_45%,transparent)]"
              >{{ p.role }}</span
            >
          </div>
          <p
            class="mt-3 text-sm leading-relaxed text-[color-mix(in_oklab,var(--page-fg)_62%,transparent)]"
          >
            {{ p.summary }}
          </p>
          <div class="mt-5 flex flex-wrap items-center gap-1.5">
            <span
              v-for="s in p.stack"
              :key="s"
              class="rounded-full bg-[color-mix(in_oklab,var(--page-fg)_7%,transparent)] px-2.5 py-0.5 text-[11px]"
              >{{ s }}</span
            >
            <AppIcon
              v-if="p.link"
              name="arrowUpRight"
              :size="14"
              class="ml-auto opacity-0 transition group-hover:opacity-100"
            />
          </div>
        </div>
      </component>
    </div>
  </div>
</template>
