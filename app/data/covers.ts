/**
 * 封面策略登记处。
 *
 * 封面按标签分两条轨，规则写在这里而不是组件里 ——
 * 「哪一类稿子长什么样」属于内容策略，应该能改配置而不动组件。
 *
 *   技术轨：文章的标签命中 terminalTags 里任意一个 → 深青绿终端风（深色打字机）
 *   浅色轨：其余 → 首词排版，大号衬线首词 + 由标签派生的底色与几何符号
 *
 * 判定逻辑在 app/components/content/CoverArt.vue，本文件只提供数据。
 */

/**
 * 技术轨标签。
 * 只要命中其中任意一个，整张封面就走终端风（不是只看第一个标签）。
 */
export const terminalTags = ['AI', '工程', '前端', '后端', '开发', '技术', '算法']

/**
 * 终端轨配色。
 *
 * 用**深青绿**而不是原来的深黑蓝、更不是纯黑：
 * 整站以青绿为主色，终端轨如果继续用蓝黑，首页上就是「青绿 + 蓝黑 + 琥珀」
 * 三套色系并置，观感是散的；压深两档的青绿既和浅色轨同族，又靠明度差拉开距离，
 * 避免两张封面糊成一块。窗口栏、命令行这些结构本身已经足够说明「这是代码」，
 * 不需要再靠冷蓝来暗示科技感。
 */
export const terminalTheme = {
  /** 深青绿底，比浅色轨的实底暗两档 */
  bg: '#0d3a34',
  /** 窗口栏分隔线 */
  rule: '#1a5a51',
  /** 正文（命令行） */
  fg: '#eafaf7',
  /** 次要信息（路径、标签） */
  dim: '#7ab8ad',
  /** 窗口左上角三个点 */
  dots: '#20685d',
}

export interface CoverAccent {
  key: string
  /** 实底主色，取自 main.css 的 accent-500 —— 整张封面就是这一块实色 */
  c: string
}

/**
 * 浅色轨调色板。
 *
 * 取值全部来自 app/assets/css/main.css 里的 6 套 accent 预设
 * （teal / amber / moss / ocean / clay / ink）的 **500 档**，不引入新色系。
 *
 * 封面是**实底 + 白字**（不是浅底 + 同色字）：浅底版本在满屏米白的页面上
 * 几乎没有存在感，也架不住大号衬线字；实底才撑得住。
 * 因为底色本身就足够浓，暗色模式不需要再换一套 —— 两种模式共用同一个值。
 */
export const coverAccents: CoverAccent[] = [
  { key: 'teal', c: '#1aa88f' },
  { key: 'amber', c: '#c97f1d' },
  { key: 'moss', c: '#5c8f3f' },
  { key: 'ocean', c: '#2b72c0' },
  { key: 'clay', c: '#bf5a34' },
  { key: 'ink', c: '#6b665e' },
]

/**
 * 标签 → 配色的**显式指定**，用来纠 hash 的偏。
 *
 * 这张表是「补丁」不是「总表」：没登记的标签照旧走 hash 自动分配
 * （见 pickAccent），所以新增标签忘了来这儿登记也照样有颜色，
 * 不会因为漏了一行就渲染不出来。
 *
 * 现有条目：
 *   设计 → teal
 *     hash 原本把「设计」落在 ink（石墨灰，#6b665e）。灰封面在首页网格里
 *     是最不抢眼的一张，而且跟站点主色不在一个语言里 —— 站点的默认 accent
 *     本身就是青绿（main.css 里 --color-accent-* 的默认段），钉成 teal 之后
 *     封面和页面主色对得上。ink 预设保留，别的标签仍可能落上去。
 */
export const coverTagAccent: Record<string, string> = {
  设计: 'teal',
}

/** 稳定的字符串 hash。同输入永远同输出，SSR 与客户端算出来一致，不会闪烁。 */
function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/**
 * 给一个标签挑配色：先查 coverTagAccent 的显式指定，没登记再按 hash 落。
 *
 * 显式表里写了不存在的 key 时**静默回落**到 hash，不抛错 ——
 * 免得把 'ocean' 手打成 'ocena' 就让整页白屏，代价太大。
 */
export function pickAccent(tag: string): CoverAccent {
  const pinned = coverTagAccent[tag]
  const hit = pinned ? coverAccents.find((a) => a.key === pinned) : undefined
  // coverAccents 是非空字面量数组，取模后一定命中；! 只是为了让 TS 闭嘴
  return hit ?? coverAccents[hash(tag) % coverAccents.length]!
}

/**
 * 直接按 **key** 取配色（不是按标签 hash）。
 *
 * 作品封面用的就是这条：项目的配色是手工挑好写在 yml 的 `accent` 字段里的，
 * 不需要猜 —— 作者已经决定「ChatMap 是青绿、ai-butler 是琥珀」了。
 * key 不认识时回落到 seed 的 hash，跟 pickAccent 一样的静默兜底策略。
 */
export function coverAccentOf(key: string, seed: string): CoverAccent {
  return coverAccents.find((a) => a.key === key) ?? pickAccent(seed)
}

/**
 * 几何符号序号（0–5）。
 * 和配色分开取 hash，否则「同色必同符号」，两个 teal 标签会长得一模一样。
 */
export function pickSymbol(tag: string): number {
  return hash(tag + '|sym') % 6
}
