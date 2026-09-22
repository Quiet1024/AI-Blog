<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <SiteHeader />

    <main class="flex-1">
      <slot />
    </main>

    <SiteFooter />

    <!-- 阅读进度条：只在文章页显示 -->
    <ReadingProgress v-if="route.path.startsWith('/blog/')" />
  </div>
</template>
