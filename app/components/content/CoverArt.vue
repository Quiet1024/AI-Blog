<script setup lang="ts">
/**
 * 自动封面：文章没配 cover 图时，按标题 hash 生成一张渐变封面。
 * 这样即使一篇图都没有，首页也是"杂志"而不是"白板"。
 */
const props = withDefaults(
  defineProps<{
    title: string
    seed?: string
    label?: string
    height?: string
  }>(),
  { seed: '', height: '16rem' },
)

const palettes = [
  { from: '#0f766e', to: '#5eead4', ink: '#f0fffb' },
  { from: '#b45309', to: '#fcd34d', ink: '#fffaf0' },
  { from: '#1e293b', to: '#64748b', ink: '#f1f5f9' },
  { from: '#7c2d12', to: '#fb923c', ink: '#fff7ed' },
  { from: '#164e63', to: '#67e8f9', ink: '#ecfeff' },
  { from: '#3f1d38', to: '#e879a6', ink: '#fdf2f8' },
  { from: '#1a2e05', to: '#a3e635', ink: '#f7fee7' },
  { from: '#312e81', to: '#a5b4fc', ink: '#eef2ff' },
]

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

const palette = computed(() => palettes[hash(props.seed || props.title) % palettes.length])

// 取标题前 2 个字放大做视觉锚点
const glyph = computed(() => {
  const t = props.title.trim()
  return /^[\u4e00-\u9fa5]/.test(t) ? t.slice(0, 2) : t.slice(0, 3).toUpperCase()
})
</script>

<template>
  <div
    class="relative overflow-hidden rounded-xl"
    :style="{
      height: props.height,
      background: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)`,
    }"
  >
    <!-- 纸张噪点 -->
    <div
      class="absolute inset-0 opacity-[0.18] mix-blend-overlay"
      style="
        background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E&quot;);
      "
    />
    <!-- 大号锚点字 -->
    <span
      class="absolute -bottom-6 -right-2 select-none font-serif text-[9rem] leading-none font-bold opacity-25"
      :style="{ color: palette.ink }"
      >{{ glyph }}</span
    >
    <div
      class="relative flex h-full flex-col justify-end p-6"
      :style="{ color: palette.ink }"
    >
      <span
        v-if="props.label"
        class="mb-2 w-fit rounded-full bg-black/20 px-2.5 py-1 text-[11px] font-medium tracking-widest uppercase backdrop-blur-sm"
        >{{ props.label }}</span
      >
    </div>
  </div>
</template>
