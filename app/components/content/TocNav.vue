<script setup lang="ts">
interface TocLink {
  id: string
  text: string
  depth: number
  children?: TocLink[]
}

const props = defineProps<{ links: TocLink[] }>()

const activeId = ref('')

onMounted(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (visible) activeId.value = visible.target.id
    },
    { rootMargin: '-80px 0px -70% 0px', threshold: [0, 1] },
  )
  document
    .querySelectorAll('.prose-magazine h2, .prose-magazine h3')
    .forEach((el) => observer.observe(el))
  onUnmounted(() => observer.disconnect())
})

const flat = computed(() => {
  const out: TocLink[] = []
  const walk = (items?: TocLink[]) =>
    (items || []).forEach((l) => {
      out.push(l)
      walk(l.children)
    })
  walk(props.links)
  return out.filter((l) => l.depth <= 3)
})
</script>

<template>
  <nav v-if="flat.length" class="text-sm">
    <p
      class="mb-3 text-[11px] font-medium tracking-[0.2em] text-[color-mix(in_oklab,var(--page-fg)_45%,transparent)] uppercase"
    >
      目录
    </p>
    <ul class="space-y-2">
      <li v-for="l in flat" :key="l.id">
        <a
          :href="`#${l.id}`"
          class="block leading-snug transition"
          :class="[
            l.depth === 3 ? 'pl-3 text-[13px]' : '',
            activeId === l.id
              ? 'text-[color:var(--color-accent-600)] dark:text-[color:var(--color-accent-300)]'
              : 'text-[color-mix(in_oklab,var(--page-fg)_55%,transparent)] hover:text-[color:var(--page-fg)]',
          ]"
          >{{ l.text }}</a
        >
      </li>
    </ul>
  </nav>
</template>
