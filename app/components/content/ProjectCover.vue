<script setup lang="ts">
/**
 * 作品封面。
 *
 * 为什么不复用文章的 CoverArt：**两者要装的内容根本不是一回事**。
 * CoverArt 的前提是「有一个 2–4 字的短词」（kicker）可以放大到占满整张卡；
 * 作品的 name 是「ai-butler 赛博工场」这种中英混排的长串，既当不了短词、
 * 拆开也没法只留一半。之前作品页直接拿 CoverArt 套，传了 title 没传 kicker，
 * 结果每张封面上的大字是**空的** —— 只剩一块纯色 + 一个 2026 的小圆牌，
 * 那才是「看起来丑」的真正原因（不是配色问题）。
 *
 * 所以这里给作品单独一套版式：**作品铭牌**。
 *   ┌───────────────────────────┐
 *   │ [2026]           ╱01╲     │  ← 年份做成深色玻璃牌；序号做巨大的水印，从右上出血
 *   │                           │
 *   │ [AI-BUTLER]               │  ← 名字里的拉丁段抽出来当药丸眉标
 *   │ 赛博工场                   │  ← 中文段放大成主标题
 *   │ ────                      │
 *   └───────────────────────────┘
 *
 * 底色沿用站点的「实底 + 白字」，但**颜色不听 hash** —— 取 yml 里手工写的
 * `accent` 字段。作者已经决定好「ChatMap 是青绿、ai-butler 是琥珀」了，
 * 没有理由再让 hash 去猜一遍。
 *
 * 封面**只放 name / 年份 / 拉丁眉标**，不放 role 和 stack：
 * 这两个在卡片正文里已经完整列出了，封面再说一遍是重复，而且会把
 * 一堆小字号堆在饱和底上。
 *
 * 两个小标签（年份、眉标）都套了深色玻璃底，主标题保持裸白字 —— 因为两者的
 * WCAG 门槛不一样：主标题是 46–62px 的大字，阈值 3:1，白字压在 accent-500 上
 * 实测 2.98–5.7:1，基本在线上；而 10–11px 的小标签要 4.5:1，裸白字只有
 * 2.65–3.85:1，明显读不清。压一层 34% 的黑之后小标签回到 5.7–9.3:1，
 * 主标题一个字没动。
 * 所有数字由 scripts/shot-page.mjs 量出来，改完记得重跑。
 */
import { coverAccentOf } from '~/data/covers'

const props = withDefaults(
  defineProps<{
    name: string
    /** 作品序号，从 1 开始，用来生成 01 / 02 那个水印 */
    index?: number
    year?: string
    /** 对应 covers.ts 里 coverAccents 的 key；不认识则回落到 name 的 hash */
    accentKey?: string
    height?: string
    /**
     * 圆角。默认 0.75rem（= Tailwind 的 rounded-xl），独立当一张封面用时合适。
     *
     * 但**当卡片头图时必须传 0**：卡片是 `rounded-2xl + overflow-hidden`，
     * 封面的四角由父级裁切统一决定；封面自己再圆一次（12px < 父级 16px）会在
     * 底部多出两个四分之一圆的缺口，卡片正文的白底从缺口漏出来 —— 看上去就是
     * 「一块彩色贴纸贴在卡片上」，而不是卡片自己的头图。
     *
     * 之所以走 inline style 而不是让调用点传 `rounded-none`：两者特异性相同，
     * 谁赢取决于 Tailwind 生成 CSS 的先后顺序（rounded-none 排在 rounded-xl 前面，
     * 所以覆盖不掉），这种「看着生效、换个版本就失效」的写法不能用。
     */
    radius?: string
  }>(),
  { index: 0, year: '', accentKey: '', height: '14rem', radius: '0.75rem' },
)

const accent = computed(() => coverAccentOf(props.accentKey, props.name))

/**
 * 把「ai-butler 赛博工场」劈成 { eyebrow: 'ai-butler', main: '赛博工场' }。
 * 纯中文名字劈不出来，那就不要眉标，把整个名字当主标题。
 */
const split = computed(() => {
  const m = props.name.match(/^([A-Za-z][A-Za-z0-9 .'&+_-]*?)\s+(\S.*)$/)
  if (m && m[1] && m[2]) return { eyebrow: m[1], main: m[2] }
  return { eyebrow: '', main: props.name }
})

const num = computed(() => (props.index > 0 ? String(props.index).padStart(2, '0') : ''))

/**
 * 主标题字号（容器查询单位 cqh，跟 CoverArt 一个路数）。
 *
 * 卡片可用宽度约为高度的 2.2 倍，一个全角字约占 1em，
 * 所以「n 个字排成一行」的上限大致是 (2.2 × 100) / n ≈ 220/n cqh；
 * 这里收到 200/n 留一点余量，再用 34cqh 封顶免得两三个字时大得离谱。
 *
 * 刻意**不用** nowrap 硬撑：万一估小了，宁可让它折成两行也不要溢出被裁掉。
 */
const sizeCqh = computed(() => {
  const n = Math.max([...split.value.main].length, 1)
  return Math.min(34, Math.round((200 / n) * 10) / 10)
})
</script>

<template>
  <div
    class="pc relative flex flex-col justify-end overflow-hidden px-5 py-5"
    :style="{ height: props.height, '--pc-c': accent.c, borderRadius: props.radius }"
  >
    <span
      v-if="props.year"
      class="pc-year absolute top-4 left-5 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium tracking-[0.14em]"
      >{{ props.year }}</span
    >

    <!-- 序号水印：从右上角出血，纯装饰 -->
    <span v-if="num" class="pc-num" aria-hidden="true">{{ num }}</span>

    <span
      v-if="split.eyebrow"
      class="pc-eyebrow relative mb-2 self-start rounded-full px-2 py-0.5 font-mono text-[11px] font-medium tracking-[0.18em]"
      >{{ split.eyebrow }}</span
    >
    <span class="pc-name relative font-serif font-bold" :style="{ fontSize: `${sizeCqh}cqh` }">{{
      split.main
    }}</span>
    <span class="pc-rule relative mt-3 block h-px w-10" />
  </div>
</template>

<style scoped>
/*
 * 尺寸用 cqh 的理由同 CoverArt —— 同一张封面在首页三栏
 * 和作品页两栏两种卡片宽度下要等比缩放，只有容器查询单位算得对。
 */
.pc {
  container-type: size;
  background: var(--pc-c);
  color: #fff;
}

/*
 * 年份牌。
 *
 * 原来是「白字 + 一圈半透明白描边」，实测白字压在 accent-500 上只有
 * 2.98–5.7:1（ink 那种深灰能过，青绿/琥珀/苔绿过不了），10px 的小字要 4.5:1
 * 才达标 —— 描边只能帮人「看出这里有东西」，帮不了「读出写的是什么」。
 *
 * 改成**深色玻璃牌**：底色压一层 34% 的黑，白字立刻回到 5.7:1 以上
 * （四种 accent 实测 5.74 / 6.08 / 6.99 / 9.26），
 * 而且深色小块在饱和底上更有分量，比描边更像一枚正经的徽章。
 *
 * 为什么不用「整块加深」一劳永逸：封面的实底色是 design token（accent-500），
 * 加深就跟 token 脱钩了；局部压暗只动这一小块，颜色仍然来自 token。
 */
.pc-year {
  color: #fff;
  /* 用 rgba 而不是 color-mix：等价（只是把中性黑按比例叠上去，跟色彩空间无关），
     但 getComputedStyle 拿到的是能直接解析的 rgba()，
     color-mix 会算成 color(srgb … / α)，脚本解析不了 —— 见 scripts/shot-page.mjs */
  background: rgba(11, 11, 10, 0.34);
  border: 1px solid rgba(255, 255, 255, 0.24);
}

/*
 * 序号水印。故意让它从右上出血、只露一部分 —— 一个完整的数字会变成
 * 「另外一个需要读的元素」，出血之后就只是纹理了。
 *
 * 透明度比文章封面的几何符号（.cv-sym 的 0.22）低一档：数字天生比抽象图形
 * 好认，同样的透明度就太抢；0.16 刚好让人「先看到名字、再看出来是编号」。
 */
.pc-num {
  position: absolute;
  top: -22%;
  right: -5%;
  font-family: var(--font-serif);
  font-weight: 700;
  font-size: 82cqh;
  line-height: 0.8;
  letter-spacing: -0.04em;
  color: #fff;
  opacity: 0.16;
  pointer-events: none;
}

/*
 * 拉丁眉标（CHATMAP / AI-BUTLER），压在标题正上方。
 *
 * 跟年份牌同款「深色玻璃」处理，理由也一样：11px 的白字直接压在 accent-500 上
 * 实测只有 2.65–2.98:1，远低于小字要求的 4.5:1。它虽然只是氛围性标签
 * （名字里的拉丁段在卡片正文的标题里也有），但既然要做就做成读得出来的 ——
 * 一行要眯着眼才看得清的小字，不会让人「觉得封面好看」，只会觉得糊。
 *
 * self-start 是必须的：容器是 flex-col，不写就会被拉伸成整行宽，
 * 药丸背景会横贯整张封面。
 */
.pc-eyebrow {
  color: #fff;
  text-transform: uppercase;
  background: rgba(11, 11, 10, 0.34);
  border: 1px solid rgba(255, 255, 255, 0.24);
}

.pc-name {
  color: #fff;
  line-height: 1;
  letter-spacing: -0.01em;
}

.pc-rule {
  background: #fff;
  opacity: 0.55;
}
</style>
