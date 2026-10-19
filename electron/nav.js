/**
 * 导航边界：决定一个 URL 是「应用自己的页面」还是「外部链接」。
 *
 * 为什么单独拆一个模块：这两个判断是整个安全模型里唯一可以脱离 Electron 测的部分，
 * 放在 main.js 里就只能靠开窗口手点。拆出来后 scripts/test-nav.js 可以在无头环境跑。
 *
 * 背景：窗口如果没有 will-navigate 拦截，点击笔记里的一条 Markdown 链接
 * 会把整个窗口导航到外站；而 preload 会在新页面重新注入，
 * window.vault 上的全部 IPC 就交给了那个页面。
 */
const { pathToFileURL } = require('url')

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** 统一成小写、解码后的形式再比较，绕开 Windows 盘符大小写与中文路径编码差异 */
function normalize(u) {
  let s = String(u || '')
  try {
    s = decodeURIComponent(s)
  } catch (_) {
    // 非法百分号编码就按原样比
  }
  return s.toLowerCase()
}

function fileBase(dir) {
  const u = pathToFileURL(dir).toString()
  return u.endsWith('/') ? u : u + '/'
}

/**
 * 只有应用自己的页面算内部：
 *   - 开发时是 vite dev server（http://localhost:5173/...）
 *   - 打包后是 dist 目录下的 file://
 * 其余一律视为外部，包括 file:// 指向的其他目录。
 */
function isInternal(url, opts = {}) {
  const target = normalize(url)
  if (!target) return false

  const dev = opts.devUrl ? normalize(opts.devUrl).replace(/\/+$/, '') : ''
  if (dev && (target === dev || target.startsWith(dev + '/'))) return true

  const base = opts.appDir ? normalize(fileBase(opts.appDir)) : ''
  if (base && target.startsWith(base)) return true

  return false
}

/** 交给系统浏览器之前再过一道协议白名单：javascript: / data: / file: 一律丢弃 */
function externalUrl(url) {
  try {
    const u = new URL(String(url))
    return EXTERNAL_PROTOCOLS.has(u.protocol) ? u.toString() : null
  } catch (_) {
    return null
  }
}

module.exports = { isInternal, externalUrl, fileBase }
