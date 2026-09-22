<script setup lang="ts">
import { accentPresets } from '~/data/accents'

const { accent, applyAccent } = useTheme()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const current = computed(
  () => accentPresets.find((p) => p.name === accent.value) || accentPresets[0],
)

function pick(name: string) {
  applyAccent(name)
  open.value = false
}

function onDocClick(e: MouseEvent) {
  if (!open.value) return
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--hairline)] transition hover:bg-[color-mix(in_oklab,var(--page-fg)_8%,transparent)]"
      :aria-label="`配色：${current.label}`"
      :title="`配色：${current.label}（点开换一套）`"
      @click="open = !open"
    >
      <span
        class="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
        :style="{ background: current.swatch }"
      />
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-[var(--hairline)] bg-[color:var(--page-bg)] p-1.5 shadow-xl"
    >
      <p
        class="px-2.5 py-1.5 text-[11px] tracking-[0.16em] text-[color-mix(in_oklab,var(--page-fg)_45%,transparent)] uppercase"
      >
        配色
      </p>
      <button
        v-for="p in accentPresets"
        :key="p.name || 'default'"
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition"
        :class="
          p.name === accent
            ? 'bg-[color-mix(in_oklab,var(--page-fg)_9%,transparent)]'
            : 'hover:bg-[color-mix(in_oklab,var(--page-fg)_5%,transparent)]'
        "
        @click="pick(p.name)"
      >
        <span
          class="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
          :style="{ background: p.swatch }"
        />
        <span class="min-w-0">
          <span class="block text-[13px] leading-tight">{{ p.label }}</span>
          <span
            class="block truncate text-[11px] leading-tight text-[color-mix(in_oklab,var(--page-fg)_50%,transparent)]"
            >{{ p.hint }}</span
          >
        </span>
      </button>
    </div>
  </div>
</template>
