<script setup lang="ts">
import { siteConfig } from '~/data/site'

const route = useRoute()
const open = ref(false)
const searchOpen = useState<boolean>('search:open', () => false)

watch(() => route.fullPath, () => (open.value = false))

const isActive = (to: string) =>
  to === '/' ? route.path === '/' : route.path.startsWith(to)
</script>

<template>
  <header
    class="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[color:var(--page-bg)]/85 backdrop-blur-md"
  >
    <div class="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
      <!-- 站点名 -->
      <NuxtLink
        to="/"
        class="font-serif text-xl font-bold tracking-tight text-[color:var(--page-fg)]"
      >
        {{ siteConfig.name }}
      </NuxtLink>

      <!-- 桌面导航 -->
      <nav class="hidden flex-1 items-center gap-1 sm:flex">
        <NuxtLink
          v-for="item in siteConfig.nav"
          :key="item.to"
          :to="item.to"
          class="rounded-full px-3 py-1.5 text-sm transition"
          :class="
            isActive(item.to)
              ? 'bg-[color-mix(in_oklab,var(--page-fg)_10%,transparent)] font-medium'
              : 'text-[color-mix(in_oklab,var(--page-fg)_65%,transparent)] hover:text-[color:var(--page-fg)]'
          "
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="ml-auto flex items-center gap-2">
        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--hairline)] px-3 text-sm text-[color-mix(in_oklab,var(--page-fg)_70%,transparent)] transition hover:text-[color:var(--page-fg)]"
          @click="searchOpen = true"
        >
          <AppIcon name="search" :size="16" />
          <span class="hidden md:inline">搜索</span>
          <kbd
            class="ml-1 hidden rounded border border-[var(--hairline)] px-1.5 text-[10px] leading-5 md:inline"
            >/</kbd
          >
        </button>
        <AccentPicker />
        <ThemeToggle />

        <!-- 移动端菜单按钮 -->
        <button
          type="button"
          class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--hairline)] sm:hidden"
          aria-label="打开菜单"
          @click="open = !open"
        >
          <AppIcon :name="open ? 'close' : 'menu'" :size="18" />
        </button>
      </div>
    </div>

    <!-- 移动端下拉 -->
    <div v-if="open" class="border-t border-[var(--hairline)] sm:hidden">
      <nav class="mx-auto flex max-w-6xl flex-col px-5 py-2">
        <NuxtLink
          v-for="item in siteConfig.nav"
          :key="item.to"
          :to="item.to"
          class="py-2.5 text-sm text-[color-mix(in_oklab,var(--page-fg)_75%,transparent)]"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
    </div>

    <SearchDialog v-model="searchOpen" />
  </header>
</template>
