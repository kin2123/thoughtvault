// 性能基线：在临时库里灌 2000 条，量各个环节耗时与索引使用情况
const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { performance } = require('perf_hooks')

const tmp = path.join(os.tmpdir(), 'thoughtvault-bench-' + Date.now())
app.setPath('userData', tmp)
app.disableHardwareAcceleration()

const N = 2000
const TAGS = ['开发', '读书', '效率', '面试', '生活', 'idea', 'todo']

function time(label, fn) {
  const t0 = performance.now()
  const r = fn()
  const ms = performance.now() - t0
  console.log(`${label.padEnd(34)} ${ms.toFixed(2).padStart(8)} ms`)
  return { r, ms }
}

app.whenReady().then(() => {
  const db = require('../electron/db')
  db.open()

  const now = Date.now()
  const seed = []
  for (let i = 0; i < N; i++) {
    const tags = [TAGS[i % TAGS.length]]
    if (i % 3 === 0) tags.push(TAGS[(i + 2) % TAGS.length])
    seed.push({
      id: 'b' + i,
      content: `第 ${i} 条笔记：今天学习 SQLite 的 FTS5 索引与查询计划，顺便记录一些 #${tags.join(' #')} 的内容，长度大概几十个字。`,
      tags,
      createdAt: now - i * 60000,
      updatedAt: now - i * 60000
    })
  }
  time('导入 2000 条（事务内）', () => db.importNotes(seed))

  console.log('\n--- 读路径 ---')
  time('列表首页 LIMIT 80', () => db.listNotes({ limit: 80 }))
  time('列表全量 LIMIT 500', () => db.listNotes({ limit: 500 }))
  time('中文搜索「学习」', () => db.listNotes({ query: '学习', limit: 80 }))
  time('标签统计 listTags', () => db.listTags())
  time('计数 getStats', () => db.getStats())
  time('回收站 listTrash', () => db.listTrash())
  time('按创建时间排序', () => db.listNotes({ sort: 'created', limit: 80 }))
  time('按字数排序', () => db.listNotes({ sort: 'length', limit: 80 }))
  time('标签+搜索组合', () => db.listNotes({ tag: '开发', query: '索引', limit: 80 }))

  console.log('\n--- 写路径 ---')
  let created
  time('新建一条', () => (created = db.createNote({ content: '基准测试新增 #bench', tags: ['bench'] })))
  time('更新一条（改标签+重建FTS）', () => db.updateNote(created.id, { content: '基准测试修改 #bench2', tags: ['bench2'] }))
  time('置顶一条', () => db.setPinned(created.id, true))
  time('软删除一条', () => db.softDelete(created.id))
  time('恢复一条', () => db.restore(created.id))
  time('标签改名（7 个标签中 1 个）', () => db.renameTag('bench2', 'bench3'))

  console.log('\n--- 备份 ---')
  time('备份到 backups/', () => db.backupTo(path.join(tmp, 'backups')))

  console.log('\n--- 查询计划 ---')
  const plan = (sql) => db.explain(sql).join(' | ')

  console.log('默认列表:', plan('SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY pinned DESC, updated_at DESC LIMIT 80'))
  console.log('按创建排序:', plan('SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY pinned DESC, created_at DESC LIMIT 80'))
  console.log('按字数排序:', plan('SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY pinned DESC, LENGTH(content) DESC LIMIT 80'))
  console.log('标签统计:', plan('SELECT t.name, COUNT(*) FROM tags t JOIN notes n ON n.id = t.note_id WHERE n.deleted_at IS NULL GROUP BY t.name'))

  console.log('\n--- 存储体积 ---')
  const dbSize = fs.statSync(db.dbFile()).size
  console.log('notes.db:', (dbSize / 1024 / 1024).toFixed(2), 'MB')

  db.close()
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
  } catch (_) {}
  app.quit()
})
