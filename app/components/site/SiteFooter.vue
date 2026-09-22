<script setup lang="ts">
import { siteConfig } from '~/data/site'

const year = new Date().getFullYear()
// 社交链接里含站内路径（RSS），普通 <a href> 不会自动带 baseURL
const withBase = useBasePath()
</script>

<template>
  <footer class="mt-24 border-t border-[var(--hairline)]">
    <div
      class="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-start md:justify-between"
    >
      <div class="max-w-sm">
        <p class="font-serif text-lg font-bold">{{ siteConfig.name }}</p>
        <p
          class="mt-2 text-sm leading-relaxed text-[color-mix(in_oklab,var(--page-fg)_58%,transparent)]"
        >
          {{ siteConfig.tagline }}
        </p>
      </div>

      <div class="flex flex-col gap-4 md:items-end">
        <div class="flex items-center gap-2">
          <a
            v-for="s in siteConfig.social"
            :key="s.label"
            :href="withBase(s.to)"
            :aria-label="s.label"
            :title="s.label"
            class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--hairline)] text-[color-mix(in_oklab,var(--page-fg)_60%,transparent)] transition hover:text-[color:var(--page-fg)]"
            target="_blank"
            rel="noopener"
          >
            <AppIcon :name="s.icon" :size="16" />
          </a>
        </div>
        <p class="text-xs text-[color-mix(in_oklab,var(--page-fg)_45%,transparent)]">
          © {{ year }} {{ siteConfig.author.name }} · 用 Nuxt Content 搭建
        </p>
      </div>
    </div>
  </footer>
</template>
