<script setup lang="ts">
/*
 * 覆盖 @nuxtjs/mdc 内置的 ProseImg。
 *
 * ── 为什么必须覆盖 ──
 *
 * 内置实现会**先给 src 拼上 app.baseURL**，再交给 @nuxt/image 的 <NuxtImg>：
 *
 *   const _base = withLeadingSlash(withTrailingSlash(useRuntimeConfig().app.baseURL))
 *   if (_base !== '/' && !props.src.startsWith(_base)) return joinURL(_base, props.src)
 *
 * 这一步在「没装 @nuxt/image、走原生 <img>」的路径下是对的。但配上 IPX 就自相矛盾了：
 * NuxtImg 把 `/` 开头的 src 当成**相对 public 目录的本地资源**，源路径直接取 src 本身。
 * 于是子路径部署（baseURL = /AI-Blog/）时：
 *
 *   markdown 里写  /chatmap/x.png
 *   ProseImg 拼成  /AI-Blog/chatmap/x.png
 *   IPX 源路径     AI-Blog/chatmap/x.png     ← 多了一次 AI-Blog
 *   → 去 public/AI-Blog/chatmap/x.png 找文件 → [404] IPX_FILE_NOT_FOUND
 *
 * 而 prerender 只要有一条路由 404 就直接判失败（Exiting due to prerender errors），
 * 于是整条 GitHub Pages 部署挂掉 —— 报错信息里只有 IPX 与文件名，
 * 看不出和 baseURL 有关，很容易误以为是图片没提交上去。
 *
 * ── 修法 ──
 *
 * 只做一件事：把 src **原样**交给 NuxtImg。
 * NuxtImg 自己会把 baseURL 加到输出 URL 的路径前缀上（/_ipx/… 前面那一段），
 * 同时用干净的 chatmap/x.png 当源路径，两边都对。IPX 的压缩与格式转换照常保留。
 *
 * ── 本机复现 ──
 *
 *   NUXT_APP_BASE_URL=/AI-Blog/ node node_modules/nuxt/bin/nuxt.mjs generate
 *
 * 不加这个变量就复现不出来：根路径部署（baseURL=/）时 refinedSrc 原样返回，一切正常。
 * 所以这个坑只在子路径部署 + 正文配图同时存在时才出现。
 */
defineProps<{
  src?: string
  alt?: string
  width?: string | number
  height?: string | number
}>()
</script>

<template>
  <NuxtImg :src="src" :alt="alt" :width="width" :height="height" />
</template>
