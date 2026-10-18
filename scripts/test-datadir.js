// 数据目录搬迁验证：复制 / 切换 / 取消 / 回滚
const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const ROOT = path.join(os.tmpdir(), 'tv-datadir-' + Date.now())
const DIR_A = path.join(ROOT, 'A')
const DIR_B = path.join(ROOT, 'B')
fs.mkdirSync(DIR_A, { recursive: true })
app.setPath('userData', DIR_A)
app.disableHardwareAcceleration()

const results = []
function check(name, ok, extra) {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

app.whenReady().then(async () => {
  const paths = require('../electron/paths')
  const db = require('../electron/db')
  const { createRelocator } = require('../electron/relocate')

  let cfg = {}
  let askResult = true
  const relocator = createRelocator({
    db,
    paths,
    saveConfig: (c) => {
      cfg = c
    },
    askAttach: async () => askResult,
    log: () => {}
  })

  db.open()
  const now = Date.now()
  db.importNotes([
    { id: 'd1', content: '第一条', tags: [], createdAt: now, updatedAt: now },
    { id: 'd2', content: '第二条', tags: [], createdAt: now - 1000, updatedAt: now - 1000 },
    { id: 'd3', content: '第三条', tags: [], createdAt: now - 2000, updatedAt: now - 2000 }
  ])
  fs.mkdirSync(paths.assets(), { recursive: true })
  fs.writeFileSync(path.join(paths.assets(), 'pic.png'), Buffer.from([1, 2, 3]))
  fs.writeFileSync(paths.draft(), JSON.stringify({ text: '草稿内容' }))

  check('初始位置是默认目录', paths.getBase() === DIR_A && !paths.isCustom(), paths.getBase())

  /* 1. 搬到空目录 → 复制 */
  const r1 = await relocator.relocate(DIR_B, cfg)
  check('搬迁到空目录成功', r1.ok && r1.mode === 'copied', JSON.stringify(r1))
  check('新位置有数据库', fs.existsSync(path.join(DIR_B, 'notes.db')))
  check('笔记数量一致', db.getStats().active === 3, 'active=' + db.getStats().active)
  check('图片一起搬过去', fs.existsSync(path.join(DIR_B, 'assets', 'pic.png')))
  check('草稿一起搬过去', fs.existsSync(path.join(DIR_B, 'draft.json')))
  check('原位置数据保留', fs.existsSync(path.join(DIR_A, 'notes.db')))
  check('配置记住了新位置', cfg.dataDir === DIR_B, cfg.dataDir)
  check('路径模块已切换', paths.getBase() === DIR_B && paths.isCustom())

  /* 2. 在新位置继续写 */
  db.createNote({ content: '搬家后新增的一条', tags: [] })
  check('新位置可正常写入', db.getStats().active === 4, 'active=' + db.getStats().active)

  /* 3. 目标已有数据 + 用户取消 */
  askResult = false
  const r2 = await relocator.relocate(DIR_A, cfg)
  check('目标有数据时取消会中止', r2.ok === false && r2.canceled === true, JSON.stringify(r2))
  check('取消后仍在原位置', paths.getBase() === DIR_B && db.getStats().active === 4)

  /* 4. 目标已有数据 + 用户确认 → 切换而非覆盖 */
  askResult = true
  const r3 = await relocator.relocate(DIR_A, cfg)
  check('确认后切换过去', r3.ok && r3.mode === 'attached', JSON.stringify(r3))
  check('读到的是目标原有数据', db.getStats().active === 3, 'active=' + db.getStats().active)
  check("切回默认目录后不再标记为自定义", !paths.isCustom())

  /* 5. 不可写目录 → 报错且不破坏现有数据 */
  const before = db.getStats().active
  const r4 = await relocator.relocate('Q:/tv-not-exist/x', cfg)
  check('不可写目录被拒绝', r4.ok === false && !!r4.error, r4.error)
  check('失败后数据还在', db.getStats().active === before && fs.existsSync(paths.notesDb()))

  console.log(`\n合计 ${results.length} 项，通过 ${results.filter(Boolean).length}`)

  db.close()
  try {
    fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 3 })
  } catch (_) {}
  app.quit()
})
