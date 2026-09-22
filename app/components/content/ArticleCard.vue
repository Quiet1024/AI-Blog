<script setup lang="ts">
/**
 * 文章卡片。
 *
 * 注意：标签行（TagPill）必须渲染在卡片主链接的「外面」。
 * TagPill 内部自己就是一个 NuxtLink，而本组件整张卡片是一个 NuxtLink，
 * 两者一旦嵌套就构成 a 套 a —— 会触发 Nuxt 诊断 NUXT_E4009，
 * 并在客户端 hydration 时报错。
 * 放到外面视觉位置完全不变（间距靠 mt-3），标签仍然是可点的链接。
 */
import type { PostItem } from '~/composables/usePosts'
import { formatDate, readingTime } from '~/composables/usePosts'

const props = withDefaults(
  defineProps<{
    post: PostItem
    /** large：首页头条，封面更高、标题更大 */
    variant?: 'default' | 'large' | 'compact'
  }>(),
  { variant: 'default' },
)

const coverHeight = computed(
  () =>
    ({ default: '11rem', large: '18rem', compact: '0' })[props.variant] as string,
)
</script>

<template>
  <article class="group">
    <NuxtLink :to="props.post.path" class="block">
      <!-- 封面 -->
      <div v-if="props.variant !== 'compact'" class="mb-4 overflow-hidden rounded-xl">
        <NuxtImg
          v-if="props.post.cover"
          :src="props.post.cover"
          :alt="props.post.title"
          class="h-full w-full rounded-xl object-cover transition duration-500 group-hover:scale-[1.03]"
          :style="{ height: coverHeight }"
          sizes="sm:100vw md:600px"
          loading="lazy"
        />
        <CoverArt
          v-else
          :title="props.post.title"
          :seed="props.post.path"
          :height="coverHeight"
          class="transition duration-500 group-hover:scale-[1.02]"
        />
      </div>

      <!-- 元信息 -->
      <div
        class="flex items-center gap-2 text-[11px] tracking-wide text-[color-mix(in_oklab,var(--page-fg)_50%,transparent)] uppercase"
      >
        <time>{{ formatDate(props.post.date) }}</time>
        <span class="opacity-40">·</span>
        <span>{{ readingTime(props.post.body) }}</span>
      </div>

      <h3
        class="mt-2 font-serif font-bold tracking-tight text-[color:var(--page-fg)] transition group-hover:text-[color:var(--color-accent-600)] dark:group-hover:text-[color:var(--color-accent-300)]"
        :class="
          props.variant === 'large'
            ? 'text-3xl leading-snug sm:text-4xl'
            : 'text-lg leading-snug'
        "
      >
        {{ props.post.title }}
      </h3>

      <p
        v-if="props.post.description"
        class="mt-2 text-sm leading-relaxed text-[color-mix(in_oklab,var(--page-fg)_62%,transparent)]"
        :class="props.variant === 'large' ? 'line-clamp-3 text-base' : 'line-clamp-2'"
      >
        {{ props.post.description }}
      </p>
    </NuxtLink>

    <div v-if="props.post.tags.length" class="mt-3 flex flex-wrap gap-1.5">
      <TagPill v-for="t in props.post.tags.slice(0, 3)" :key="t" :name="t" />
    </div>
  </article>
</template>
