<script setup lang="ts">
/**
 * 自动封面：文章没配 cover 图时，按标签生成一张有语义的封面。
 *
 * 两条轨（判定见下方 isTerminal），**共用一套以青绿为底的语言**：
 *
 *   技术轨（深色打字机）
 *     标签命中 terminalTags 任意一个 → 深青绿终端窗口 + 等宽命令行。
 *     底色是压深两档的青绿（#0d3a34），不是纯黑、也不是蓝黑 ——
 *     整站主色是青绿，终端轨如果单开一套冷蓝，首页就是三套色系并置，观感会散。
 *     「这是代码」由窗口栏、`$ cat` 提示符、等宽字体来说，不必靠冷色调暗示。
 *
 *   浅色轨（首词排版）
 *     其余文章 → **实底 + 白字**：大号衬线首词压在标签派生的实色块上，
 *     右上角配一个白色几何符号（只做形状区分，不跟配色走，否则在实底上会隐形）。
 *     底色由 covers.ts 的 pickAccent 决定：先查 coverTagAccent 的显式指定，
 *     没登记就按标签 hash 从 6 套 accent 里挑 —— 所以同一个标签的文章永远长一个样，
 *     首页网格扫一眼就能分类。
 *
 * 两条轨靠**明度**拉开而不是靠色相：浅色轨是饱和度拉满的品牌青绿，技术轨是对应的深色。
 *
 * 首词取 props.kicker，没配就回落到第一个标签 —— 标签本身就是短词，
 * 比截取标题前两个字体面得多。
 */
import { pickAccent, pickSymbol, terminalTags, terminalTheme } from '~/data/covers'

const props = withDefaults(
  defineProps<{
    title: string
    /** 一般传文章 path，用它的末段当命令行里的文件名 */
    seed?: string
    label?: string
    height?: string
    tags?: string[]
    kicker?: string
  }>(),
  { seed: '', label: '', height: '16rem', tags: () => [], kicker: '' },
)

const tagList = computed(() => (props.tags || []).filter(Boolean))


/** 命中任意一个技术标签就整张走终端风 */
const isTerminal = computed(() => tagList.value.some((t) => terminalTags.includes(t)))

/**
 * 浅色轨拿哪个标签去取色：
 * 优先第一个「非技术」标签 —— 否则一篇 [设计, 前端] 会因为 前端 命中技术轨，
 * 而 设计 的颜色却没机会用上，白白浪费一次分类信号。
 */
const colorTag = computed(() => {
  const list = tagList.value
  return list.find((t) => !terminalTags.includes(t)) || list[0] || props.title
})

const accent = computed(() => pickAccent(colorTag.value))

/** 命令行里显示的文件名，从 path 末段取 */
// const slug = computed(() => props.seed.split('/').filter(Boolean).pop() || 'post')

const kickerWord = computed(() => props.kicker || tagList.value[0] || '')

const sym = computed(() => pickSymbol(colorTag.value))

/* 下面三组是给模板里 v-for 用的预计算坐标，避免在模板里写循环逻辑 */
const dotGrid = computed(() => {
  const out: { k: string; x: number; y: number }[] = []
  for (let x = 12; x <= 96; x += 21) {
    for (let y = 12; y <= 96; y += 21) out.push({ k: `${x}-${y}`, x, y })
  }
  return out
})

const bars = computed(() =>
  [26, 50, 38, 70, 42, 62, 30].map((h, i) => ({
    k: i,
    x: 10 + i * 13,
    y: 92 - h,
    w: 6.5,
    h,
  })),
)

const baselines = computed(() =>
  [14, 30, 46, 62, 78].map((y, i) => ({
    k: y,
    y,
    w: i === 2 ? 54 : 80,
    o: Number((0.3 + i * 0.14).toFixed(2)),
  })),
)
</script>

<template>
  <!-- 技术轨：深青绿终端窗口 -->
  <div
    v-if="isTerminal"
    class="cv-term relative flex flex-col overflow-hidden rounded-xl font-mono"
    :style="{
      height: props.height,
      background: terminalTheme.bg,
      '--cv-rule': terminalTheme.rule,
    }"
  >
    <div
      class="flex items-center gap-1.5 px-3.5 py-2.5"
      :style="{ borderBottom: `1px solid ${terminalTheme.rule}` }"
    >
      <i
        v-for="n in 3"
        :key="n"
        class="block h-2 w-2 rounded-full"
        :style="{ background: terminalTheme.dots }"
      />
      <span
        class="ml-1.5 truncate text-[11px]"
        :style="{ color: terminalTheme.dim }"
        >cat md</span
      >
      <span
        v-if="props.label"
        class="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] tracking-widest uppercase"
        :style="{ color: terminalTheme.dim, border: `1px solid ${terminalTheme.rule}` }"
        >{{ props.label }}</span
      >
    </div>

    <div class="mt-auto px-4 pt-4 pb-4">
      <div class="text-xs leading-relaxed" :style="{ color: terminalTheme.fg }">
        <span :style="{ color: 'var(--color-accent-400)' }">$</span>
        <!-- cat {{ slug }}.md -->
         {{ tagList?.[0] || 'hello world' }}
        <span
          class="cv-cur ml-1 inline-block h-3 w-[7px] align-[-2px]"
          :style="{ background: 'var(--color-accent-400)' }"
        />
      </div>
      <div
        v-if="tagList.length"
        class="mt-2 text-[11px] tracking-wide"
        :style="{ color: terminalTheme.dim }"
      >
        {{ tagList.join('  ') }}
      </div>
    </div>
  </div>

  <!-- 浅色轨：首词排版（实底 + 白字） -->
  <div
    v-else
    class="cv-light relative flex flex-col justify-end overflow-hidden rounded-xl px-5 py-5"
    :style="{ height: props.height, '--cv-c': accent.c }"
  >
    <span
      v-if="props.label"
      class="cv-label absolute top-4 left-5 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-widest uppercase"
      >{{ props.label }}</span
    >

    <!--
      标签符号：纯装饰，位置在右上，避开左下的大字。
      一律用 currentColor（白），不跟标签配色走 —— 底色本身已经是那套色了，
      符号再用同一个色等于隐形；并且这样符号只负责「形状」这一个区分维度。
    -->
    <svg class="cv-sym" viewBox="0 0 100 100" aria-hidden="true">
      <g v-if="sym === 0" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle cx="52" cy="50" r="41" />
        <circle cx="52" cy="50" r="27" />
        <circle cx="52" cy="50" r="13" fill="currentColor" stroke="none" />
      </g>
      <g v-else-if="sym === 1" fill="currentColor">
        <circle v-for="d in dotGrid" :key="d.k" :cx="d.x" :cy="d.y" r="4.2" />
      </g>
      <g v-else-if="sym === 2" fill="currentColor">
        <rect
          v-for="b in bars"
          :key="b.k"
          :x="b.x"
          :y="b.y"
          :width="b.w"
          :height="b.h"
        />
      </g>
      <g v-else-if="sym === 3" fill="currentColor">
        <path d="M6 100 L100 6 L100 100 Z" opacity="0.75" />
        <path d="M6 62 L46 22 L46 62 Z" />
      </g>
      <g v-else-if="sym === 4">
        <g fill="none" stroke="currentColor" stroke-width="1.6">
          <path
            d="M22 32 L52 20 L80 44 M22 32 L36 68 M80 44 L64 80 M36 68 L64 80 M52 20 L36 68"
          />
        </g>
        <g fill="currentColor">
          <circle cx="22" cy="32" r="5.4" />
          <circle cx="52" cy="20" r="5.4" />
          <circle cx="80" cy="44" r="5.4" />
          <circle cx="36" cy="68" r="5.4" />
          <circle cx="64" cy="80" r="5.4" />
        </g>
      </g>
      <g v-else fill="currentColor">
        <rect
          v-for="l in baselines"
          :key="l.k"
          x="10"
          :y="l.y"
          :width="l.w"
          height="6"
          rx="3"
          :opacity="l.o"
        />
      </g>
    </svg>

    <span class="cv-word relative font-serif font-bold tracking-tight">{{
      kickerWord
    }}</span>
    <span class="cv-rule relative mt-3 block h-px w-10" />
    <span
      v-if="tagList.length"
      class="cv-tags relative mt-2.5 block font-mono text-[11px] tracking-wider"
      >{{ tagList.join(' · ') }}</span
    >
  </div>
</template>

<style scoped>
/*
 * 尺寸全部用容器查询单位（cqh）而不是 rem / vw：
 * 同一个封面在卡片（11rem）、头条（18–22rem）、文章页（22–26rem）三种高度下
 * 要等比例缩放，而且调用点会用 sm:h-96! 这类 class 覆盖内联 height —— 
 * 只有 cqh 能在「高度被 class 改掉」之后依然算对。
 */
.cv-light {
  container-type: size;
  /* 实底：直接用 accent-500，不再做浅底 + 同色字 */
  background: var(--cv-c);
  color: #fff;
}

/*
 * ⚠️ 曾经这里有一条 `.dark .cv-light { background: var(--cv-d-bg) }` 的暗色变体，
 * 现在**删掉了** —— 实底色本身就足够浓，在近黑页面上并不刺眼，两种模式共用一个值，
 * 反而去掉了「暗色下颜色跑偏」这一整类问题。
 *
 * 顺带记一个坑（以后要加暗色变体时别再踩）：必须写成 `.dark .cv-light`，
 * 不能写 `:global(.dark) .cv-light` —— scoped 编译器会把 `:global()` 原样输出，
 * 浏览器不认识这条选择器，整条规则被**静默丢弃**，没有报错，只是完全不生效。
 */

/* 终端轨本身已是深色，暗色模式下和页面底色（#0e0e0d）贴得太近，补一条细边勾轮廓 */
.cv-term {
  border: 1px solid transparent;
}

.dark .cv-term {
  border-color: var(--cv-rule);
}

.cv-word {
  font-size: 28cqh;
  line-height: 0.95;
  color: #fff;
  white-space: nowrap;
}

/* 白字在饱和底上，靠不透明度做层级，不要再引第三种颜色 */
.cv-rule {
  background: #fff;
  opacity: 0.5;
}

.cv-tags {
  color: #fff;
  opacity: 0.88;
}

.cv-label {
  color: #fff;
  border: 1px solid color-mix(in oklab, #fff 48%, transparent);
  opacity: 0.9;
}

/*
 * 符号画在饱和实底上，所以是白色的低透明度纹理 ——
 * 白字已经占满注意力，符号再重就和字抢了。
 */
.cv-sym {
  position: absolute;
  top: -14%;
  right: -10%;
  width: 62cqh;
  height: 62cqh;
  opacity: 0.22;
}

.cv-cur {
  animation: cv-blink 1.4s steps(1) infinite;
}

@keyframes cv-blink {
  50% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cv-cur {
    animation: none;
  }
}
</style>
