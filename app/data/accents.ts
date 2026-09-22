/**
 * 配色预设登记处。
 * name 必须与 app/assets/css/main.css 里的 [data-accent='xxx'] 对应；
 * swatch 只是给切换器画小圆点用的颜色。
 */
export interface AccentPreset {
  name: string
  label: string
  hint: string
  swatch: string
}

export const accentPresets: AccentPreset[] = [
  { name: '', label: '青绿', hint: '默认，冷静克制', swatch: '#1aa88f' },
  { name: 'amber', label: '琥珀', hint: '温暖，适合生活/随笔', swatch: '#c97f1d' },
  { name: 'moss', label: '苔绿', hint: '自然，适合长文阅读', swatch: '#5c8f3f' },
  { name: 'ocean', label: '深海蓝', hint: '偏理性，适合技术稿', swatch: '#2b72c0' },
  { name: 'clay', label: '陶土', hint: '复古印刷感', swatch: '#bf5a34' },
  { name: 'ink', label: '石墨', hint: '纯黑白，最像纸质杂志', swatch: '#4e4a43' },
]

export const ACCENT_STORAGE_KEY = 'accent'
