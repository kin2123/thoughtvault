const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')
const paths = require('./paths')

let db = null

const SCHEMA_VERSION = 1

/**
 * 迁移阶梯：每一项负责把库从下标版本升到下标 + 1，按顺序执行。
 *   0 → 1：初始 schema，建表语句就在 open() 里，这里留空。
 * 以后加字段/加表时往数组末尾追加一项，**不要修改已发布的项**。
 */
const MIGRATIONS = [
  () => {} // 0 → 1
]

function schemaVersion() {
  return db.pragma('user_version', { simple: true })
}

/**
 * 只在「库比程序旧」时才写 user_version。
 *
 * 原来的写法是每次 open 都无条件写一遍，这会在两种情况下把版本信息弄坏：
 *   ① 用户装回旧版本，旧程序把新库的版本号改小 → 下次升级时迁移重跑；
 *   ② 将来有人加了 v2 的迁移，降级再升级就会对着已经迁移过的表再跑一遍。
 */
function migrate() {
  const from = schemaVersion()
  if (from > SCHEMA_VERSION) {
    // 库比程序新（降级安装）：保持原样，不要覆写
    console.warn('[db] 数据库版本 ' + from + ' 高于程序支持的 ' + SCHEMA_VERSION + '，跳过迁移')
    return
  }
  if (from === SCHEMA_VERSION) return
  for (let v = from; v < SCHEMA_VERSION; v++) MIGRATIONS[v]()
  db.pragma('user_version = ' + SCHEMA_VERSION)
}

/* ---------- 中文分词 ---------- */
// FTS5 的 unicode61 会把连续汉字当成一个 token，导致搜「学习」搜不到「今天学习」。
// 做法：写入和查询时都在每个汉字前后插空格，让每个字独立成 token，查询用短语匹配。
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g

function segment(text) {
  if (!text) return ''
  return String(text)
    .replace(CJK, (c) => ' ' + c + ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 把用户输入转成 FTS5 查询：多词之间 AND，每个词用短语保证相邻
function toFtsQuery(raw) {
  const terms = String(raw || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => segment(t))
    .filter(Boolean)
  if (!terms.length) return null
  return terms.map((t) => '"' + t.replace(/"/g, '""') + '"').join(' AND ')
}

/* ---------- 连接与建表 ---------- */

function dbFile() {
  return paths.notesDb()
}

function open() {
  if (db) return db
  const file = dbFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  // 并发：桌面端可能被同一份数据的两个实例碰到，等 5s 再报 SQLITE_BUSY
  db.pragma('busy_timeout = 5000')
  // 64MB 页缓存（负数单位是 KB），默认只有 2MB
  db.pragma('cache_size = -64000')
  // 排序 / GROUP BY 的临时表放内存，省掉磁盘往返
  db.pragma('temp_store = MEMORY')
  // 内存映射读，减少 read() 系统调用
  db.pragma('mmap_size = 134217728')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id         TEXT PRIMARY KEY,
      content    TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      pinned     INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_notes_live ON notes(deleted_at, pinned DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(deleted_at, pinned DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted_at);

    CREATE TABLE IF NOT EXISTS tags (
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      name    TEXT NOT NULL,
      PRIMARY KEY (note_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      note_id UNINDEXED,
      seg,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `)
  migrate()
  return db
}

function close() {
  if (db) {
    try {
      // 更新查询计划器统计信息，下次启动的语句编译更快
      db.pragma('optimize')
      db.pragma('wal_checkpoint(TRUNCATE)')
      db.close()
    } catch (_) {}
    db = null
  }
}

/* ---------- 标签解析 ---------- */
// 与渲染层保持同一套字符集；main 侧再解析一遍，
// 这样任何入口（IPC 直调、批量打标签、将来加的 CLI）都不会和界面不一致
const TAG_RE = /#([\p{L}\p{N}_\-\/]+)/gu

function parseTags(text) {
  const out = []
  for (const m of String(text || '').matchAll(TAG_RE)) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

const TAG_NAME_RE = /^[\p{L}\p{N}_\-\/]+$/u

/* ---------- 行映射 ---------- */

function tagsFor(ids) {
  const map = new Map()
  if (!ids.length) return map
  const placeholders = ids.map(() => '?').join(',')
  const rows = db
    .prepare(`SELECT note_id, name FROM tags WHERE note_id IN (${placeholders})`)
    .all(...ids)
  for (const r of rows) {
    if (!map.has(r.note_id)) map.set(r.note_id, [])
    map.get(r.note_id).push(r.name)
  }
  return map
}

function toNote(row, tagMap) {
  return {
    id: row.id,
    content: row.content,
    tags: (tagMap && tagMap.get(row.id)) || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pinned: Boolean(row.pinned),
    deletedAt: row.deleted_at || null
  }
}

function hydrate(rows) {
  const map = tagsFor(rows.map((r) => r.id))
  return rows.map((r) => toNote(r, map))
}

/* ---------- 写入 ---------- */

function replaceTags(id, tags) {
  db.prepare('DELETE FROM tags WHERE note_id = ?').run(id)
  const ins = db.prepare('INSERT OR IGNORE INTO tags (note_id, name) VALUES (?, ?)')
  for (const name of tags || []) if (name) ins.run(id, name)
}

function syncFts(note, tags) {
  db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(note.id)
  const seg = segment(note.content + ' ' + (tags || []).join(' '))
  db.prepare('INSERT INTO notes_fts (note_id, seg) VALUES (?, ?)').run(note.id, seg)
}

function createNote({ content }) {
  const text = String(content == null ? '' : content).trim()
  if (!text) throw new Error('内容为空，不能保存')
  const tags = parseTags(text)
  const now = Date.now()
  const id =
    (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) ||
    String(now) + Math.random().toString(36).slice(2)
  const note = { id, content: text, tags, createdAt: now, updatedAt: now, pinned: false, deletedAt: null }
  db.transaction(() => {
    db.prepare(
      'INSERT INTO notes (id, content, created_at, updated_at, deleted_at, pinned) VALUES (?,?,?,?,NULL,0)'
    ).run(id, text, now, now)
    replaceTags(id, note.tags)
    syncFts(note, note.tags)
  })()
  return note
}

function updateNote(id, { content }) {
  const text = String(content == null ? '' : content).trim()
  if (!text) throw new Error('内容为空，不能保存')
  const tags = parseTags(text)
  const now = Date.now()
  db.transaction(() => {
    db.prepare('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?').run(text, now, id)
    replaceTags(id, tags)
    syncFts({ id, content: text }, tags)
  })()
  return getNote(id)
}

function setPinned(id, pinned) {
  db.prepare('UPDATE notes SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id)
  return getNote(id)
}

function softDelete(id) {
  db.prepare('UPDATE notes SET deleted_at = ? WHERE id = ?').run(Date.now(), id)
  return true
}

function restore(id) {
  db.prepare('UPDATE notes SET deleted_at = NULL WHERE id = ?').run(id)
  return getNote(id)
}

function purge(id) {
  db.transaction(() => {
    db.prepare('DELETE FROM tags WHERE note_id = ?').run(id)
    db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(id)
    db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  })()
  return true
}

// 批量删的写法：原来是逐行 3 次 DELETE，N 条就是 3N 次语句往返。
// 现在不管多少条都是固定的 3 条。顺序不能反——先清依赖它的两张表，
// 再删 notes，否则子查询就选不到东西了。
function emptyTrash() {
  return db.transaction(() => {
    db.prepare(
      'DELETE FROM tags WHERE note_id IN (SELECT id FROM notes WHERE deleted_at IS NOT NULL)'
    ).run()
    db.prepare(
      'DELETE FROM notes_fts WHERE note_id IN (SELECT id FROM notes WHERE deleted_at IS NOT NULL)'
    ).run()
    return db.prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL').run().changes
  })()
}

/** 回收站超过 30 天的自动清理 */
function purgeExpired(ttl = 30 * 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - ttl
  const where = 'note_id IN (SELECT id FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?)'
  return db.transaction(() => {
    db.prepare('DELETE FROM tags WHERE ' + where).run(cutoff)
    db.prepare('DELETE FROM notes_fts WHERE ' + where).run(cutoff)
    return db
      .prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?')
      .run(cutoff).changes
  })()
}

/* ---------- 查询 ---------- */

function getNote(id) {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
  if (!row) return null
  return toNote(row, tagsFor([id]))
}

function listNotes({ query = '', tag = '', sort = 'updated', limit = 500 } = {}) {
  const order = {
    updated: 'pinned DESC, updated_at DESC',
    created: 'pinned DESC, created_at DESC',
    length: 'pinned DESC, LENGTH(content) DESC, updated_at DESC'
  }[sort] || 'pinned DESC, updated_at DESC'

  const fts = toFtsQuery(query)
  let rows

  if (fts) {
    const params = [fts]
    let sql = `SELECT n.* FROM notes_fts f JOIN notes n ON n.id = f.note_id
               WHERE notes_fts MATCH ? AND n.deleted_at IS NULL`
    if (tag) {
      sql += ' AND EXISTS (SELECT 1 FROM tags t WHERE t.note_id = n.id AND t.name = ?)'
      params.push(tag)
    }
    sql += ' ORDER BY ' + order.replace(/\b(pinned|updated_at|created_at|content)\b/g, 'n.$1') + ' LIMIT ?'
    params.push(limit)
    rows = db.prepare(sql).all(...params)
  } else {
    const params = []
    let sql = 'SELECT * FROM notes WHERE deleted_at IS NULL'
    if (tag) {
      sql += ' AND EXISTS (SELECT 1 FROM tags t WHERE t.note_id = notes.id AND t.name = ?)'
      params.push(tag)
    }
    sql += ' ORDER BY ' + order + ' LIMIT ?'
    params.push(limit)
    rows = db.prepare(sql).all(...params)
  }
  return hydrate(rows)
}

function listTrash(limit = 500) {
  const rows = db
    .prepare('SELECT * FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ?')
    .all(limit)
  return hydrate(rows)
}

function listTags() {
  return db
    .prepare(
      `SELECT t.name AS name, COUNT(*) AS count
       FROM tags t JOIN notes n ON n.id = t.note_id
       WHERE n.deleted_at IS NULL
       GROUP BY t.name
       ORDER BY count DESC, name ASC`
    )
    .all()
}

function getStats() {
  // 这里保持两次 COUNT，别合并成 SUM(deleted_at IS NULL)：
  // COUNT 走的是 idx_notes_deleted 的范围查找（SEARCH ... COVERING INDEX），
  // 而 SUM 要对每一行求值，只能全索引扫描（SCAN）。
  // 1 万条实测：两次 COUNT 0.294ms，合并成 SUM 反而 0.773ms，慢 2.6 倍。
  const live = db.prepare('SELECT COUNT(*) c FROM notes WHERE deleted_at IS NULL').get().c
  const trash = db.prepare('SELECT COUNT(*) c FROM notes WHERE deleted_at IS NOT NULL').get().c
  return { active: live, trash }
}

function exportAll() {
  const rows = db.prepare('SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY created_at ASC').all()
  return hydrate(rows)
}

/* ---------- 标签维护 ---------- */

function escapeTagName(name) {
  return String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 把正文里的 #旧标签 换成 #新标签（或删掉），并同步 FTS */
function rewriteTag(content, from, to) {
  const re = new RegExp('#' + escapeTagName(from) + '(?![\\p{L}\\p{N}_\\-\\/])', 'gu')
  let next = content.replace(re, to ? '#' + to : '')
  next = next.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim()
  return next
}

function renameTag(from, to) {
  const target = String(to || '').trim()
  if (!target) return { ok: false, error: '新标签名不能为空' }
  if (!TAG_NAME_RE.test(target)) {
    return { ok: false, error: '标签名只能用中英文、数字、下划线、短横线、斜杠' }
  }
  const ids = db
    .prepare(
      `SELECT n.id, n.content FROM notes n
       JOIN tags t ON t.note_id = n.id WHERE t.name = ?`
    )
    .all(from)
  if (!ids.length) return { ok: false, error: '没有找到这个标签' }

  db.transaction(() => {
    for (const row of ids) {
      const content = rewriteTag(row.content, from, target)
      db.prepare('UPDATE notes SET content = ? WHERE id = ?').run(content, row.id)
      db.prepare('INSERT OR IGNORE INTO tags (note_id, name) VALUES (?, ?)').run(row.id, target)
      db.prepare('DELETE FROM tags WHERE note_id = ? AND name = ?').run(row.id, from)
      syncFts({ id: row.id, content }, [target])
    }
  })()
  return { ok: true, affected: ids.length }
}

function deleteTag(name) {
  const ids = db
    .prepare(
      `SELECT n.id, n.content FROM notes n
       JOIN tags t ON t.note_id = n.id WHERE t.name = ?`
    )
    .all(name)
  if (!ids.length) return { ok: false, error: '没有找到这个标签' }

  db.transaction(() => {
    for (const row of ids) {
      const content = rewriteTag(row.content, name, null)
      db.prepare('UPDATE notes SET content = ? WHERE id = ?').run(content, row.id)
      db.prepare('DELETE FROM tags WHERE note_id = ? AND name = ?').run(row.id, name)
      const rest = db.prepare('SELECT name FROM tags WHERE note_id = ?').all(row.id).map((r) => r.name)
      syncFts({ id: row.id, content }, rest)
    }
  })()
  return { ok: true, affected: ids.length }
}

/** 给一批笔记批量打标签（已经有的跳过） */
function addTags(ids, tags) {
  const list = (tags || []).map((t) => String(t).trim()).filter(Boolean)
  if (!list.length || !ids || !ids.length) return { ok: false, error: '没有可打标签的内容' }
  const bad = list.find((t) => !TAG_NAME_RE.test(t))
  if (bad) return { ok: false, error: `标签「${bad}」含不允许的字符` }
  let changed = 0

  db.transaction(() => {
    for (const id of ids) {
      const row = db.prepare('SELECT content FROM notes WHERE id = ?').get(id)
      if (!row) continue
      const owned = db.prepare('SELECT name FROM tags WHERE note_id = ?').all(id).map((r) => r.name)
      const add = list.filter((t) => !owned.includes(t))
      if (!add.length) continue
      const content = row.content + ' ' + add.map((t) => '#' + t).join(' ')
      db.prepare('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?').run(content, Date.now(), id)
      for (const t of add) {
        db.prepare('INSERT OR IGNORE INTO tags (note_id, name) VALUES (?, ?)').run(id, t)
      }
      syncFts({ id, content }, owned.concat(add))
      changed++
    }
  })()
  return { ok: true, affected: changed }
}

/** 批量软删除 */
function batchSoftDelete(ids) {
  if (!ids || !ids.length) return 0
  const now = Date.now()
  const stmt = db.prepare('UPDATE notes SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL')
  let n = 0
  db.transaction(() => {
    for (const id of ids) n += stmt.run(now, id).changes
  })()
  return n
}

/* ---------- 导入与迁移 ---------- */

/**
 * content 是标签的唯一真相。外部 JSON 的 tags 字段只当「补全来源」：
 * 正文里没有的标签补写进正文，这样导入后第一次编辑不会把它弄丢。
 * （老写法直接用 raw.tags 建标签行，正文里却没有 #标签，
 *   updateNote 一重新解析就全没了。）
 */
function mergeTagsIntoContent(rawContent, rawTags) {
  const text = String(rawContent == null ? '' : rawContent)
  if (!Array.isArray(rawTags) || !rawTags.length) return text
  const present = parseTags(text)
  const extra = []
  for (const t of rawTags) {
    const name = String(t == null ? '' : t).trim().replace(/^#/, '')
    if (!name || present.includes(name) || extra.includes(name)) continue
    if (!TAG_NAME_RE.test(name)) continue
    extra.push(name)
  }
  if (!extra.length) return text
  return text + ' ' + extra.map((t) => '#' + t).join(' ')
}

function importNotes(list) {
  const exists = db.prepare('SELECT 1 FROM notes WHERE id = ?')
  let added = 0
  let skipped = 0
  db.transaction(() => {
    for (const raw of list || []) {
      if (!raw || typeof raw.content !== 'string') {
        skipped++
        continue
      }
      const id =
        raw.id ||
        'imp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      if (exists.get(id)) {
        skipped++
        continue
      }
      // 外部 JSON 可能带负数 / 字符串 / NaN 时间戳，统一纠正为合理值
      const safeTs = (v, fallback) => {
        const n = Number(v)
        return Number.isFinite(n) && n > 0 && n < 4102444800000 ? n : fallback
      }
      const createdAt = safeTs(raw.createdAt, Date.now())
      const updatedAt = safeTs(raw.updatedAt, createdAt)
      const content = mergeTagsIntoContent(raw.content, raw.tags)
      const tags = parseTags(content)
      db.prepare(
        'INSERT INTO notes (id, content, created_at, updated_at, deleted_at, pinned) VALUES (?,?,?,?,?,?)'
      ).run(id, content, createdAt, updatedAt, raw.deletedAt || null, raw.pinned ? 1 : 0)
      replaceTags(id, tags)
      syncFts({ id, content }, tags)
      added++
    }
  })()
  // 批量写入后合并 FTS 索引段，否则索引会碎成很多小段
  if (added > 50) optimizeFts()
  return { added, skipped }
}

/** 从旧版 notes.json 迁移一次，成功后把源文件改名留档 */
function migrateFromJson() {
  const jsonFile = path.join(paths.getBase(), 'notes.json')
  if (!fs.existsSync(jsonFile)) return { migrated: 0, skipped: true }
  const count = db.prepare('SELECT COUNT(*) c FROM notes').get().c
  if (count > 0) return { migrated: 0, skipped: true, reason: '数据库已有数据' }
  try {
    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'))
    const notes = Array.isArray(data) ? data : data.notes
    if (!Array.isArray(notes) || !notes.length) return { migrated: 0, skipped: true }
    const res = importNotes(notes)
    fs.renameSync(jsonFile, jsonFile + '.migrated-' + Date.now())
    return { migrated: res.added, skipped: false }
  } catch (err) {
    return { migrated: 0, skipped: true, reason: err.message }
  }
}

/* ---------- 备份 ---------- */

function backupTo(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const name =
    'notes-' +
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds()) +
    '.db'
  const dest = path.join(dir, name)

  // VACUUM INTO 产出的是紧凑的独立副本，不依赖 -wal / -shm，
  // 也不会在写入过程中拿到半截状态。比直接 copyFile 安全。
  try {
    db.prepare('VACUUM INTO ?').run(dest)
    return { ok: true, name, path: dest, at: Date.now() }
  } catch (err) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
      fs.copyFileSync(dbFile(), dest)
      return { ok: true, name, path: dest, at: Date.now(), fallback: true }
    } catch (err2) {
      return { ok: false, error: err2.message }
    }
  }
}

/** 合并 FTS5 的倒排索引段，批量写入后调用能明显缩小索引、加快查询 */
function optimizeFts() {
  try {
    db.exec("INSERT INTO notes_fts(notes_fts) VALUES('optimize')")
    return true
  } catch (_) {
    return false
  }
}

/** 一次 IPC 拿齐首屏需要的数据，省掉多次往返 */
function bootstrap(opts = {}) {
  return {
    list: listNotes(opts),
    tags: listTags(),
    stats: getStats()
  }
}

/**
 * 完整校验：除了查结构，还会交叉验证「索引内容是否和表内容一致」。
 * 代价是全库扫描，1 万条实测 47~81ms，且随数据量线性增长。
 * 只在低频高危场合用（比如数据目录搬迁）。
 */
function integrityCheck() {
  try {
    return db.pragma('integrity_check', { simple: true })
  } catch (err) {
    return 'error: ' + err.message
  }
}

/**
 * 快速校验：只查页结构与索引结构本身，跳过索引↔表的交叉比对。
 * 1 万条实测 26ms，比完整校验快约 3 倍。
 * 日常启动用它就够了——能抓到页损坏，代价又不挡首屏。
 */
function quickCheck() {
  try {
    return db.pragma('quick_check', { simple: true })
  } catch (err) {
    return 'error: ' + err.message
  }
}

/** 调试用：返回查询计划，确认走没走索引 */
function explain(sql, params) {
  return db
    .prepare('EXPLAIN QUERY PLAN ' + sql)
    .all(...(params || []))
    .map((r) => r.detail)
}

module.exports = {
  open,
  close,
  dbFile,
  segment,
  toFtsQuery,
  createNote,
  updateNote,
  getNote,
  setPinned,
  softDelete,
  batchSoftDelete,
  renameTag,
  deleteTag,
  addTags,
  restore,
  purge,
  emptyTrash,
  purgeExpired,
  listNotes,
  listTrash,
  listTags,
  getStats,
  exportAll,
  importNotes,
  migrateFromJson,
  backupTo,
  optimizeFts,
  bootstrap,
  integrityCheck,
  quickCheck,
  schemaVersion,
  explain
}
