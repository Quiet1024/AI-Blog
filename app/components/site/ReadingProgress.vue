<script setup lang="ts">
import { useWindowScroll } from '@vueuse/core'

const { y } = useWindowScroll()
const docHeight = ref(0)

const progress = computed(() => {
  // SSR 阶段没有 window，直接返回 0，否则服务端渲染会 500
  if (typeof window === 'undefined') return 0
  const scrollable = docHeight.value - window.innerHeight
  if (scrollable <= 0) return 0
  return Math.min(100, Math.max(0, (y.value / scrollable) * 100))
})

function measure() {
  docHeight.value = document.documentElement.scrollHeight
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
  // 图片加载后高度会变，重新量一次
  window.addEventListener('load', measure)
})
onUnmounted(() => {
  window.removeEventListener('resize', measure)
  window.removeEventListener('load', measure)
})
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px]">
    <div
      class="h-full bg-[color:var(--color-accent-500)] transition-[width] duration-100 ease-out"
      :style="{ width: `${progress}%` }"
    />
  </div>
</template>
