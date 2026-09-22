/**
 * 把站内绝对路径拼上 app.baseURL。
 *
 * 为什么需要它：NuxtLink / NuxtImg 会自动带上 baseURL，但写在普通
 * `<a href>` / `<img src>` 字符串里的路径**不会**。站点部署在子路径时
 * （例如 GitHub Pages 项目页 https://<user>.github.io/<repo>/，
 * app.baseURL 为 '/<repo>/'），这些路径会指向域名根目录而 404。
 *
 * 用法：
 *   const withBase = useBasePath()
 *   withBase('/rss.xml')         // '/' → '/rss.xml'      '/repo/' → '/repo/rss.xml'
 *   withBase('/avatar.svg')      // '/' → '/avatar.svg'   '/repo/' → '/repo/avatar.svg'
 *   withBase('https://a.com/x')  // 原样返回
 */
export function useBasePath() {
  const baseURL: string = useRuntimeConfig().app.baseURL || '/'
  const prefix = baseURL.replace(/\/+$/, '')

  return (path?: string | null) => {
    if (!path) return ''
    // 外部链接 / 协议链接 / 协议相对地址 / 纯锚点，一律原样返回
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(path)) return path
    return `${prefix}/${String(path).replace(/^\/+/, '')}`
  }
}
