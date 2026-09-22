<script setup lang="ts">
const props = withDefaults(defineProps<{ name: string; count?: number }>(), {
  count: undefined,
})
</script>

<template>
  <NuxtLink
    :to="`/tags/${encodeURIComponent(props.name)}`"
    class="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] px-2.5 py-1 text-xs text-[color-mix(in_oklab,var(--page-fg)_68%,transparent)] transition hover:border-[color:var(--color-accent-500)] hover:text-[color:var(--color-accent-600)] dark:hover:text-[color:var(--color-accent-300)]"
  >
    <span>#{{ props.name }}</span>
    <span
      v-if="props.count !== undefined"
      class="text-[10px] text-[color-mix(in_oklab,var(--page-fg)_40%,transparent)]"
      >{{ props.count }}</span
    >
  </NuxtLink>
</template>
