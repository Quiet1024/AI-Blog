import { ACCENT_STORAGE_KEY } from '~/data/accents'

/**
 * 亮/暗模式 + 配色预设，都是全局单例状态，落在 <html> 上。
 * 首屏由 nuxt.config.ts 里的内联脚本提前写好属性，避免白闪和掉色。
 */
const THEME_KEY = 'theme'

export function useTheme() {
  const isDark = useState<boolean>('theme:isDark', () => false)
  const accent = useState<string>('theme:accent', () => '')

  function apply(next: boolean | 'system') {
    let dark: boolean
    if (next === 'system') {
      dark =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      localStorage.removeItem(THEME_KEY)
    } else {
      dark = next
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
    }
    isDark.value = dark
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', dark)
    }
  }

  function toggle() {
    apply(!isDark.value)
  }

  /** 传空字符串 = 回到默认青绿 */
  function applyAccent(name: string) {
    accent.value = name
    if (typeof document !== 'undefined') {
      const el = document.documentElement
      if (name) el.dataset.accent = name
      else delete el.dataset.accent
      if (name) localStorage.setItem(ACCENT_STORAGE_KEY, name)
      else localStorage.removeItem(ACCENT_STORAGE_KEY)
    }
  }

  onMounted(() => {
    isDark.value = document.documentElement.classList.contains('dark')
    accent.value = document.documentElement.dataset.accent || ''
  })

  return { isDark, toggle, apply, accent, applyAccent }
}
