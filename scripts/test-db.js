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

  check('完整性检查', db.integrityCheck() === 'ok', db.integrityCheck())

  const failed = results.filter((r) => !r.ok)
  console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)

  db.close()
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
  } catch (_) {}
  app.quit()
})
