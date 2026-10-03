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

    <!--
      n8n AI 聊天窗（右下角气泡），全站挂载。
      组件内部自己判断开关：site.ts 里 chat.n8nWebhookUrl 为空时不渲染、不发请求。
      放在 layout 而不是 app.vue / nuxt.config，是为了让它只在客户端、空闲时才加载
      —— 它的 bundle 有 437 KB(brotli)，不能进首屏。详见 N8N-CHAT.md。
    -->
    <ChatWidget />
  </div>
</template>
