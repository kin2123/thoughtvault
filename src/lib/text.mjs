// 纯展示逻辑：标签剥离、时间格式化、按天分组。
// 放在 Vue 组件外面，一是 App.vue 少 70 行，二是这些函数可以在 Node 里直接测
// （scripts/test-logic.js 通过动态 import 跑它们，不需要真实窗口）。

const TAG_RE = /#([\p{L}\p{N}_\-/]+)/gu

/** 把正文里的 #标签 去掉，只留给人看的文本 */
export function stripTags(text) {
  return String(text == null ? '' : text)
    .replace(TAG_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** 列表里的时间：今天 14:05 / 昨天 09:30 / 10-18 09:30 / 2025-10-18 */
export function fmtTime(ts, now = Date.now()) {
  const d = new Date(ts)
  const n = new Date(now)
  const hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes())
  if (d.toDateString() === n.toDateString()) return '今天 ' + hm
  const yesterday = new Date(n.getTime() - 86400000)
  if (d.toDateString() === yesterday.toDateString()) return '昨天 ' + hm
  if (d.getFullYear() === n.getFullYear()) {
    return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + hm
  }
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

/** 分组键：YYYY-MM-DD，用来判断两条笔记是不是同一天 */
export function dayKey(ts) {
  const d = new Date(ts)
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

/** 分组标题：今天 / 昨天 / 10月18日 周六 / 2025年10月18日 */
export function dayLabel(ts, now = Date.now()) {
  const d = new Date(ts)
  const n = new Date(now)
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((today - day) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  if (d.getFullYear() === n.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${week}`
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/** 按当前排序字段决定用哪个时间分组 */
export function groupTs(note, sort = 'updated') {
  return sort === 'created' ? note.createdAt : note.updatedAt
}

/**
 * 把已排好序的笔记切成「按天」的组。
 * 按篇幅排序时不分组（返回一个 label 为 null 的组），由模板判断不渲染表头。
 */
export function buildGroups(items, { sort = 'updated', now = Date.now() } = {}) {
  if (sort === 'length') return [{ key: '_all', label: null, ts: 0, items }]

  const out = []
  const index = new Map()
  for (const note of items) {
    const ts = groupTs(note, sort)
    const key = dayKey(ts)
    if (!index.has(key)) {
      const group = { key, label: dayLabel(ts, now), ts, items: [] }
      index.set(key, group)
      out.push(group)
    }
    index.get(key).items.push(note)
  }
  return out
}
