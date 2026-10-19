const DATA_KEY = 'thoughtvault:data'
const CONFIG_KEY = 'thoughtvault:config'
const DRAFT_KEY = 'thoughtvault:draft'
const native = typeof window !== 'undefined' ? window.vault : null

export const isDesktop = Boolean(native)

const DEFAULT_CONFIG = {
  hotkey: 'CommandOrControl+Shift+Space',
  hotkeyActive: 'CommandOrControl+Shift+Space',
  hideOnBlur: true,
  launchAtLogin: false,
  appVersion: '0.3.0',
  dataDir: '浏览器 localStorage',
  isCustomDataDir: false,
  defaultDataDir: '—',
  backupsDir: '—',
  lastBackupAt: 0,
  isPackaged: false
}

/* =========================================================
   浏览器兜底实现（npm run dev 直接开浏览器时用）
   接口与桌面版一致，只是查询在内存里做
   ========================================================= */

function lsRead() {
  try {
    const data = JSON.parse(localStorage.getItem(DATA_KEY) || 'null')
    if (!data || !Array.isArray(data.notes)) return []
    return data.notes
  } catch (_) {
    return []
  }
}

function lsWrite(notes) {
  localStorage.setItem(DATA_KEY, JSON.stringify({ version: 1, notes }))
}

function lsId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)
}

function lsSort(a, b) {
  if (Boolean(b.pinned) !== Boolean(a.pinned)) return b.pinned ? 1 : -1
  return b.updatedAt - a.updatedAt
}

/* =========================================================
   笔记：对外统一接口
   ========================================================= */

export async function listNotes({ query = '', tag = '', sort = 'updated', limit = 500 } = {}) {  if (native) return native.list({ query, tag, sort, limit })
  const q = query.trim().toLowerCase()
  const list = lsRead().filter((n) => {
    if (n.deletedAt) return false
    if (tag && !(n.tags || []).includes(tag)) return false
    if (!q) return true
    return (
      n.content.toLowerCase().includes(q) || (n.tags || []).some((t) => t.toLowerCase().includes(q))
    )
  })
  if (sort === 'created') return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
  if (sort === 'length') {
    return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.content.length - a.content.length)
  }
  return list.sort(lsSort)
}

export async function listTrash() {
  if (native) return native.trash()
  return lsRead()
    .filter((n) => n.deletedAt)
    .sort((a, b) => b.deletedAt - a.deletedAt)
}

export async function listTags() {
  if (native) return native.tags()
  const map = new Map()
  for (const n of lsRead()) {
    if (n.deletedAt) continue
    for (const t of n.tags || []) map.set(t, (map.get(t) || 0) + 1)
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export async function getStats() {
  if (native) return native.stats()
  const notes = lsRead()
  return {
    active: notes.filter((n) => !n.deletedAt).length,
    trash: notes.filter((n) => n.deletedAt).length
  }
}

export async function createNote({ content, tags }) {
  if (native) return native.create({ content, tags })
  const now = Date.now()
  const note = {
    id: lsId(),
    content,
    tags: tags || [],
    createdAt: now,
    updatedAt: now,
    pinned: false,
    deletedAt: null
  }
  lsWrite([note, ...lsRead()])
  return note
}

export async function updateNote(id, { content, tags }) {
  if (native) return native.update(id, { content, tags })
  const notes = lsRead()
  const n = notes.find((x) => x.id === id)
  if (n) {
    n.content = content
    n.tags = tags || []
    n.updatedAt = Date.now()
    lsWrite(notes)
    return n
  }
  return null
}

export async function setPinned(id, pinned) {
  if (native) return native.pin(id, pinned)
  const notes = lsRead()
  const n = notes.find((x) => x.id === id)
  if (n) {
    n.pinned = pinned
    lsWrite(notes)
  }
  return n
}

export async function deleteNote(id) {
  if (native) return native.remove(id)
  const notes = lsRead()
  const n = notes.find((x) => x.id === id)
  if (n) {
    n.deletedAt = Date.now()
    lsWrite(notes)
  }
  return true
}

export async function restoreNote(id) {
  if (native) return native.restore(id)
  const notes = lsRead()
  const n = notes.find((x) => x.id === id)
  if (n) {
    n.deletedAt = null
    lsWrite(notes)
  }
  return n
}

export async function purgeNote(id) {
  if (native) return native.purge(id)
  lsWrite(lsRead().filter((x) => x.id !== id))
  return true
}

export async function emptyTrash() {
  if (native) return native.emptyTrash()
  const notes = lsRead()
  const count = notes.filter((n) => n.deletedAt).length
  lsWrite(notes.filter((n) => !n.deletedAt))
  return count
}

export async function exportAll() {
  if (native) return native.exportAll()
  return lsRead()
    .filter((n) => !n.deletedAt)
    .sort((a, b) => a.createdAt - b.createdAt)
}

/** IPC 只接受可结构化克隆的纯数据，Vue 的 Proxy 会报 "An object could not be cloned" */
function toPlainArray(value) {
  return Array.from(value || []).map((v) => (typeof v === 'object' && v !== null ? { ...v } : v))
}

export async function batchDeleteNotes(ids) {
  const plain = toPlainArray(ids)
  if (native) return native.batchDelete(plain)
  const now = Date.now()
  const notes = lsRead()
  let n = 0
  for (const note of notes) {
    if (plain.includes(note.id) && !note.deletedAt) {
      note.deletedAt = now
      n++
    }
  }
  lsWrite(notes)
  return n
}

/** 标签改名：正文里的 #旧名 一起改，避免下次编辑又变回去 */
export async function renameTag(from, to) {
  if (native) return native.renameTag(from, to)
  const target = String(to || '').trim()
  if (!target) return { ok: false, error: '新标签名不能为空' }
  const notes = lsRead()
  let affected = 0
  for (const n of notes) {
    if (!(n.tags || []).includes(from)) continue
    n.content = swapTag(n.content, from, target)
    n.tags = [...new Set((n.tags || []).map((t) => (t === from ? target : t)))]
    n.updatedAt = Date.now()
    affected++
  }
  lsWrite(notes)
  return affected ? { ok: true, affected } : { ok: false, error: '没有找到这个标签' }
}

export async function deleteTag(name) {
  if (native) return native.deleteTag(name)
  const notes = lsRead()
  let affected = 0
  for (const n of notes) {
    if (!(n.tags || []).includes(name)) continue
    n.content = swapTag(n.content, name, null)
    n.tags = (n.tags || []).filter((t) => t !== name)
    n.updatedAt = Date.now()
    affected++
  }
  lsWrite(notes)
  return affected ? { ok: true, affected } : { ok: false, error: '没有找到这个标签' }
}

export async function addTagsToNotes(ids, tags) {
  const plainIds = toPlainArray(ids)
  const plainTags = toPlainArray(tags)
  if (native) return native.addTags(plainIds, plainTags)
  const list = plainTags.map((t) => String(t).trim()).filter(Boolean)
  if (!list.length) return { ok: false, error: '标签不能为空' }
  const notes = lsRead()
  let changed = 0
  for (const n of notes) {
    if (!plainIds.includes(n.id)) continue
    const owned = n.tags || []
    const add = list.filter((t) => !owned.includes(t))
    if (!add.length) continue
    n.content = n.content + ' ' + add.map((t) => '#' + t).join(' ')
    n.tags = owned.concat(add)
    n.updatedAt = Date.now()
    changed++
  }
  lsWrite(notes)
  return { ok: true, affected: changed }
}

function swapTag(content, from, to) {
  const esc = String(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp('#' + esc + '(?![\\p{L}\\p{N}_\\-\\/])', 'gu')
  return content
    .replace(re, to ? '#' + to : '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

export async function saveAsset(buffer, ext = 'png') {
  if (native) return native.saveAsset({ buffer, ext })
  try {
    const blob = new Blob([buffer])
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return { ok: true, url }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/** 一次拿齐首屏数据：列表 + 标签 + 计数；withTags=false 时跳过标签统计 */
export async function bootstrapNotes(opts = {}) {
  if (native) return native.bootstrap(opts)
  const { withTags = true, ...listOpts } = opts
  const list = await listNotes(listOpts)
  const stats = await getStats()
  if (!withTags) return { list, stats }
  return { list, tags: await listTags(), stats }
}

/* =========================================================
   草稿
   ========================================================= */

export async function loadDraft() {
  if (native) {
    try {
      return await native.loadDraft()
    } catch (_) {
      return ''
    }
  }
  return localStorage.getItem(DRAFT_KEY) || ''
}

export async function saveDraft(text) {
  if (native) return native.saveDraft(text || '')
  if (text) localStorage.setItem(DRAFT_KEY, text)
  else localStorage.removeItem(DRAFT_KEY)
  return true
}

export async function clearDraft() {
  if (native) return native.clearDraft()
  localStorage.removeItem(DRAFT_KEY)
  return true
}

/* =========================================================
   配置
   ========================================================= */

export async function getConfig() {
  if (native) {
    try {
      return { ...DEFAULT_CONFIG, ...(await native.getConfig()) }
    } catch (_) {
      return { ...DEFAULT_CONFIG }
    }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}')
    return { ...DEFAULT_CONFIG, ...saved }
  } catch (_) {
    return { ...DEFAULT_CONFIG }
  }
}

export async function setConfig(patch) {
  if (native) return { ...DEFAULT_CONFIG, ...(await native.setConfig(patch)) }
  const current = await getConfig()
  const next = { ...current, ...patch }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next))
  return next
}

export async function setHotkey(accel) {
  if (native) return native.setHotkey(accel)
  return { ok: false, error: '浏览器预览模式下不能改全局快捷键' }
}

export async function resetHotkey() {
  if (native) return native.resetHotkey()
  return { ok: false, error: '浏览器预览模式下不能改全局快捷键' }
}

/* =========================================================
   备份 / 导入导出
   ========================================================= */

export async function backupNow() {
  if (native) return native.backupNow()
  return { ok: false, error: '仅桌面版支持备份' }
}

export async function backupList() {
  if (native) return native.backupList()
  return []
}

export async function openDir(which) {
  if (native) return native.openDir(which)
  return null
}

/* ---------- 数据目录 ---------- */

export async function pickDataDir() {
  if (native) return native.pickDataDir()
  return { ok: false, error: '仅桌面版支持更改数据位置' }
}

export async function relocateDataDir(target) {
  if (native) return native.relocateDataDir(target)
  return { ok: false, error: '仅桌面版支持更改数据位置' }
}

export async function resetDataDir() {
  if (native) return native.resetDataDir()
  return { ok: false, error: '仅桌面版支持更改数据位置' }
}

export async function exportFile({ defaultName, content }) {
  if (native) return native.exportFile({ defaultName, content })
  try {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = defaultName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return { ok: true, path: defaultName }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function importJson() {
  if (native) return native.importJson()
  return { ok: false, error: '浏览器预览模式下不支持导入，请用桌面版' }
}

/* =========================================================
   导出内容生成
   ========================================================= */

function pad(n) {
  return String(n).padStart(2, '0')
}

function fmtDateTime(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function notesToMarkdown(notes) {
  const sorted = [...notes].sort((a, b) => a.createdAt - b.createdAt)
  const head = ['# 思库导出', '', `> 导出时间：${fmtDateTime(Date.now())}　共 ${sorted.length} 条`, '']
  const body = []
  for (const n of sorted) {
    body.push(`## ${fmtDateTime(n.createdAt)}`)
    body.push('')
    body.push(n.content)
    body.push('')
    if (n.tags && n.tags.length) {
      body.push(n.tags.map((t) => '#' + t).join(' '))
      body.push('')
    }
    body.push('---')
    body.push('')
  }
  return head.concat(body).join('\n')
}

export function exportFileName(ext) {
  const d = new Date()
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
  return `思库-${stamp}.${ext}`
}

/* =========================================================
   窗口 / 快捷键显示
   ========================================================= */

export function hideWindow() {
  if (native) native.hide()
}

export function onFocusInput(cb) {
  if (native) return native.onFocusInput(cb)
  return () => {}
}

export function onOpenPanel(cb) {
  if (native) return native.onOpenPanel(cb)
  return () => {}
}

export function prettyHotkey(accel) {
  if (!accel) return '未设置'
  return accel
    .replace(/CommandOrControl|Command|CmdOrCtrl/gi, 'Ctrl')
    .replace(/Control/gi, 'Ctrl')
    .replace(/\+/g, ' + ')
}
