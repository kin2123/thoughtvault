// 数据库层自检：在临时目录跑真实 SQLite，覆盖增删改查、中文搜索、标签、回收站、导入去重
const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const tmp = path.join(os.tmpdir(), 'thoughtvault-db-test-' + Date.now())
app.setPath('userData', tmp)
app.disableHardwareAcceleration()

const results = []
function check(name, ok, extra) {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

app.whenReady().then(() => {
  const db = require('../electron/db')
  db.open()
  check('open() 之后 isOpen 为 true', db.isOpen() === true)

  const a = db.createNote({ content: '今天学习 SQLite 的 FTS5 索引 #开发 #数据库' })
  const b = db.createNote({ content: '面试复盘：FastAPI 依赖注入答得太浅 #面试' })
  const c = db.createNote({ content: '读书笔记：注意力残留 #读书' })

  check('创建笔记', db.getStats().active === 3, `active=${db.getStats().active}`)
  check('读取单条', db.getNote(a.id).content.includes('FTS5'))

  check('中文双字搜索「学习」', db.listNotes({ query: '学习' }).length === 1)
  check('中文单字搜索「书」', db.listNotes({ query: '书' }).length >= 1)
  check('英文搜索 sqlite（大小写不敏感）', db.listNotes({ query: 'sqlite' }).length === 1)
  check('多词 AND「面试 fastapi」', db.listNotes({ query: '面试 fastapi' }).length === 1)
  check('无结果词「量子力学」', db.listNotes({ query: '量子力学' }).length === 0)
  check('按标签搜索「开发」', db.listNotes({ query: '开发' }).length === 1)

  const tags = db.listTags()
  check('标签统计', tags.length === 4 && tags.find((t) => t.name === '开发').count === 1, JSON.stringify(tags))

  check('标签筛选', db.listNotes({ tag: '读书' }).length === 1)
  check('标签+关键词组合', db.listNotes({ tag: '面试', query: 'fastapi' }).length === 1)

  db.setPinned(b.id, true)
  check('置顶排序在第一', db.listNotes({})[0].id === b.id)

  db.updateNote(a.id, { content: '今天学习 SQLite 的 FTS5 索引，改了内容', tags: ['开发'] })
  check('更新后搜索命中新内容', db.listNotes({ query: '改了内容' }).length === 1)
  check('更新后旧标签移除', db.listNotes({ tag: '数据库' }).length === 0)

  db.softDelete(c.id)
  check('软删除后列表不含该条', db.listNotes({}).length === 2)
  check('回收站可见', db.listTrash().length === 1)
  check('删除后搜索搜不到', db.listNotes({ query: '注意力' }).length === 0)

  db.restore(c.id)
  check('恢复后重新可见', db.listNotes({}).length === 3)

  db.purge(c.id)
  check('彻底删除', db.listNotes({}).length === 2 && db.listTrash().length === 0)

  const imp = db.importNotes([
    { id: a.id, content: '重复的', tags: [] },
    { content: '外部导入的一条 #导入', tags: ['导入'], createdAt: Date.now() }
  ])
  check('导入去重', imp.added === 1 && imp.skipped === 1, JSON.stringify(imp))

  /* 导入的标签必须落进正文——否则第一次编辑就丢 */
  const impTags = db.importNotes([
    { content: '正文本身没有标签', tags: ['补全', 'bad tag', '#带井号'] }
  ])
  const impNote = db.listNotes({ query: '补全' })[0]
  check(
    '导入时 tags 补写进正文（非法标签被丢弃）',
    impTags.added === 1 &&
      !!impNote &&
      impNote.content.includes('#补全') &&
      impNote.content.includes('#带井号') &&
      !impNote.content.includes('bad tag'),
    impNote && impNote.content
  )
  const beforeEdit = db.getNote(impNote.id).tags.slice().sort().join(',')
  db.updateNote(impNote.id, { content: impNote.content + ' 追加一句' })
  const afterEdit = db.getNote(impNote.id).tags.slice().sort().join(',')
  check('导入的标签经过一次编辑仍在', beforeEdit === afterEdit, beforeEdit + ' -> ' + afterEdit)

  /* 标签维护 */
  const tagNote = db.createNote({ content: '标签测试 #旧名 结尾' })
  db.renameTag('旧名', '新名')
  const renamed = db.getNote(tagNote.id)
  check('标签改名同步正文', renamed.content.includes('#新名') && !renamed.content.includes('#旧名'))
  check('改名后标签表更新', renamed.tags.includes('新名') && !renamed.tags.includes('旧名'))
  check('改名后可被搜索', db.listNotes({ query: '新名' }).length >= 1)

  db.addTags([tagNote.id], ['额外'])
  const added = db.getNote(tagNote.id)
  check('批量打标签', added.tags.includes('额外') && added.content.includes('#额外'))

  db.deleteTag('新名')
  const cleaned = db.getNote(tagNote.id)
  check('删标签清正文', !cleaned.content.includes('#新名') && !cleaned.tags.includes('新名'))

  /* 批量删除与排序 */
  const ids = db.listNotes({}).map((n) => n.id)
  const del = db.batchSoftDelete(ids)
  check('批量软删除', del === ids.length && db.getStats().active === 0, `deleted=${del}`)
  for (const id of ids) db.restore(id)

  const sortedCreated = db.listNotes({ sort: 'created' })
  const sortedLen = db.listNotes({ sort: 'length' })
  check('按创建时间排序', sortedCreated.length > 0 && sortedCreated[0].createdAt >= sortedCreated[sortedCreated.length - 1].createdAt)
  check('按字数排序', sortedLen.length > 0 && sortedLen[0].content.length >= sortedLen[sortedLen.length - 1].content.length)

  const bak = db.backupTo(path.join(tmp, 'backups'))
  check('备份生成 .db 文件', bak.ok && fs.existsSync(bak.path) && fs.statSync(bak.path).size > 0)

  /* 批量清理：换成 IN 子查询后必须验证三张表都不留孤儿 */
  // 单独开一个连接去数 tags / notes_fts 的真实行数。
  // 不能用 listTags() 验证，它 JOIN 了 notes，孤儿行在那儿是看不见的。
  const BS = require('better-sqlite3')
  const probe = () => {
    const d = new BS(require('../electron/paths').notesDb())
    const r = {
      tags: d.prepare('SELECT COUNT(*) c FROM tags').get().c,
      fts: d.prepare('SELECT COUNT(*) c FROM notes_fts').get().c
    }
    d.close()
    return r
  }
  const count = (n) => {
    const r = []
    for (let i = 0; i < n; i++) r.push(db.createNote({ content: `批量第 ${i} 条 #批量${i % 5}` }).id)
    return r
  }

  const beforeEmpty = probe()
  db.batchSoftDelete(count(50))
  const removed = db.emptyTrash()
  const afterEmpty = probe()
  check('emptyTrash 返回清除条数', removed === 50, `removed=${removed}`)
  check('emptyTrash 后无孤儿标签', afterEmpty.tags === beforeEmpty.tags, `tags ${beforeEmpty.tags}->${afterEmpty.tags}`)
  check('emptyTrash 后无孤儿 FTS 行', afterEmpty.fts === beforeEmpty.fts, `fts ${beforeEmpty.fts}->${afterEmpty.fts}`)

  const beforePurge = probe()
  db.batchSoftDelete(count(30))
  // ttl 取负数让 cutoff 必定落在 deleted_at 之后，
  // 否则同一毫秒内 deleted_at < cutoff 不成立，测试会随机失败
  const purged = db.purgeExpired(-1)
  const afterPurge = probe()
  check('purgeExpired 返回清除条数', purged === 30, `purged=${purged}`)
  check('purgeExpired 后无孤儿标签', afterPurge.tags === beforePurge.tags, `tags ${beforePurge.tags}->${afterPurge.tags}`)
  check('purgeExpired 后无孤儿 FTS 行', afterPurge.fts === beforePurge.fts, `fts ${beforePurge.fts}->${afterPurge.fts}`)

  // 空库时 SUM() 返回 NULL，getStats 必须兜成 0
  db.batchSoftDelete(db.listNotes({}).map((n) => n.id))
  db.emptyTrash()
  const emptyStats = db.getStats()
  check('空库 getStats 返回 0 而非 null', emptyStats.active === 0 && emptyStats.trash === 0, JSON.stringify(emptyStats))

  /* schema 版本：只在「库比程序旧」时迁移并写版本，降级不能覆写 */
  check('新建库的 user_version 是 1', db.schemaVersion() === 1, 'v=' + db.schemaVersion())

  const BS2 = require('better-sqlite3')
  const setUserVersion = (v) => {
    db.close()
    const d = new BS2(require('../electron/paths').notesDb())
    d.pragma('user_version = ' + v)
    d.close()
    db.open()
  }

  setUserVersion(0)
  check('user_version=0 时自动迁移到 1', db.schemaVersion() === 1, 'v=' + db.schemaVersion())

  setUserVersion(9)
  check('库版本高于程序时不覆写', db.schemaVersion() === 9, 'v=' + db.schemaVersion())
  setUserVersion(1) // 复原，别影响后面的断言

  // 完整校验留着（搬迁时用），启动路径改走快速校验，两个都要断言
  check('完整性检查', db.integrityCheck() === 'ok')
  check('快速检查', db.quickCheck() === 'ok', db.quickCheck())

  const failed = results.filter((r) => !r.ok)
  console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)

  db.close()
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
  } catch (_) {}
  app.quit()
})
