<script setup lang="ts">
const { isDark, toggle } = useTheme()
</script>

<template>
  <button
    type="button"
    class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--hairline)] text-[color:var(--page-fg)] transition hover:bg-[color-mix(in_oklab,var(--page-fg)_8%,transparent)]"
    :aria-label="isDark ? '切换到亮色模式' : '切换到暗色模式'"
    :title="isDark ? '切换到亮色模式' : '切换到暗色模式'"
    @click="toggle()"
  >
    <AppIcon :name="isDark ? 'sun' : 'moon'" :size="18" />
  </button>
</template>
