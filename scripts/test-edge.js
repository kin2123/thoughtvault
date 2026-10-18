// 边界与攻击性测试：专挑容易崩的地方
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const tmp = path.join(os.tmpdir(), 'tv-edge-' + Date.now())
app.setPath('userData', tmp)
app.disableHardwareAcceleration()

const root = path.join(__dirname, '..')
const results = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function check(name, ok, extra) {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

app.whenReady().then(async () => {
  const db = require('../electron/db')
  const store = require('../electron/store')
  const config = require('../electron/config')
  const stub = require('./ipc-stub')

  db.open()
  const now = Date.now()
  db.importNotes([
    { id: 'e1', content: '今天学习 SQLite 的索引', tags: ['开发'], createdAt: now, updatedAt: now },
    { id: 'e2', content: '读书笔记：注意力残留', tags: ['读书'], createdAt: now - 1000, updatedAt: now - 1000 }
  ])
  stub.install({ db, store, config, tmp })

  const win = new BrowserWindow({
    width: 780,
    height: 640,
    show: true,
    backgroundColor: '#101014',
    webPreferences: {
      preload: path.join(root, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  const errors = []
  win.webContents.on('console-message', (_e, level, msg) => {
    if (level >= 2) errors.push(msg)
  })

  await win.loadFile(path.join(root, 'dist', 'index.html'))
  await sleep(1500)

  /* ---------- 1. 搜索输入的恶意/畸形内容 ---------- */
  const nasty = ['"', '""', '*', '(', ')', 'AND', 'NEAR(', '!!!', '   ', 'a"b', '\\', '%', '_']
  let ftsBroken = []
  for (const q of nasty) {
    const r = await win.webContents.executeJavaScript(`(async () => {
      try {
        const rows = await window.vault.list({ query: ${JSON.stringify(q)} })
        return { ok: true, n: rows.length }
      } catch (e) {
        return { ok: false, err: String(e && e.message) }
      }
    })()`)
    if (!r.ok) ftsBroken.push(q + ' -> ' + r.err)
  }
  check('奇怪搜索词不会让查询崩掉', ftsBroken.length === 0, ftsBroken.join(' | '))

  const onlySymbol = await win.webContents.executeJavaScript(
    'window.vault.list({ query: "@@@" })'
  )
  check('纯符号搜索返回空而不是全部', onlySymbol.length === 0, 'got=' + onlySymbol.length)

  /* ---------- 2. Markdown 里的 XSS ---------- */
  await win.webContents.executeJavaScript(`(async () => {
    await window.vault.create({
      content: '<img src=x onerror="window.__xss=1"> [点我](javascript:window.__xss=2) <script>window.__xss=3<\\/script>',
      tags: []
    });
  })()`)
  await sleep(600)
  const xss = await win.webContents.executeJavaScript(`(() => ({
    flag: window.__xss || 0,
    img: document.querySelectorAll('.md-body img').length,
    script: document.querySelectorAll('.md-body script').length,
    text: document.querySelector('.md-body') ? document.querySelector('.md-body').textContent.slice(0, 30) : ''
  }))()`)
  check('HTML/脚本被转义不执行', xss.flag === 0 && xss.img === 0 && xss.script === 0, JSON.stringify(xss))

  /* ---------- 3. 超长内容 ---------- */
  const huge = '长文本测试。'.repeat(8000) // 约 12 万字
  const big = await win.webContents.executeJavaScript(`(async () => {
    const t0 = performance.now();
    try {
      const n = await window.vault.create({ content: ${JSON.stringify(huge)}, tags: [] });
      return { ok: !!n.id, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      return { ok: false, err: String(e && e.message) };
    }
  })()`)
  check('12 万字笔记能存', big.ok, JSON.stringify(big))

  await sleep(800)
  const bigRender = await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('.list');
    return { overflowX: el ? el.scrollWidth > el.clientWidth + 2 : null, notes: document.querySelectorAll('.note').length };
  })()`)
  check('超长内容不撑破横向布局', bigRender.overflowX === false, JSON.stringify(bigRender))

  /* ---------- 4. 空白 / 边界输入 ---------- */
  const before = db.getStats().active
  const emptyRes = await win.webContents.executeJavaScript(`(async () => {
    try {
      await window.vault.create({ content: '   \\n\\t  ' });
      return { rejected: false };
    } catch (e) {
      return { rejected: true, msg: String(e && e.message).slice(-20) };
    }
  })()`)
  await sleep(300)
  check(
    '纯空白会被拒绝且不落库',
    emptyRes.rejected && db.getStats().active === before,
    JSON.stringify(emptyRes)
  )

  /* ---------- 5. 标签边界 ---------- */
  const tagCase = await win.webContents.executeJavaScript(`(async () => {
    const n = await window.vault.create({ content: '标签测试 #a.b #中文 #a_b #x/y', tags: [] });
    const list = await window.vault.list({ query: '标签测试' });
    return { tags: list[0] ? list[0].tags : [] };
  })()`)
  const got = tagCase.tags.slice().sort()
  const want = ['a', 'a_b', 'x/y', '中文'].sort()
  check('标签解析不吃非法字符', JSON.stringify(got) === JSON.stringify(want), JSON.stringify(tagCase.tags))

  const renameSpecial = await win.webContents.executeJavaScript(`(async () => {
    try {
      const r = await window.vault.renameTag('a_b', 'c_d');
      return { ok: r.ok, affected: r.affected };
    } catch (e) {
      return { ok: false, err: String(e && e.message) };
    }
  })()`)
  check('含下划线的标签可以改名', renameSpecial.ok === true, JSON.stringify(renameSpecial))

  const badName = await win.webContents.executeJavaScript(`(async () => {
    try {
      const r = await window.vault.renameTag('c_d', '带 空格');
      return { ok: r.ok, err: r.error };
    } catch (e) {
      return { ok: false, err: String(e && e.message) };
    }
  })()`)
  check('非法标签名被拒绝', badName.ok === false && !!badName.err, JSON.stringify(badName))

  /* ---------- 6. 导入畸形数据 ---------- */
  const badImport = await win.webContents.executeJavaScript(`(async () => {
    try {
      await window.vault.list({ query: '' });
      return { ok: true };
    } catch (e) {
      return { ok: false, err: String(e && e.message) };
    }
  })()`)
  check('基础查询稳定', badImport.ok, JSON.stringify(badImport))

  const importShapes = db.importNotes([null, {}, { content: 123 }, { content: '正常一条' }])
  check('导入会跳过畸形条目', importShapes.added === 1 && importShapes.skipped === 3, JSON.stringify(importShapes))

  /* ---------- 7. 多选状态下切到回收站 ---------- */
  await win.webContents.executeJavaScript(
    '[...document.querySelectorAll(".chip-btn")].find((b) => b.textContent.trim() === "多选").click(); true'
  )
  await sleep(300)
  await win.webContents.executeJavaScript(
    'document.querySelector("button[title=\\"回收站\\"]").click(); true'
  )
  await sleep(500)
  const selectTrash = await win.webContents.executeJavaScript(`(() => ({
    batchbar: !!document.querySelector('.batchbar'),
    trash: !!document.querySelector('.trash')
  }))()`)
  check('进回收站时退出多选模式', selectTrash.trash && !selectTrash.batchbar, JSON.stringify(selectTrash))

  // 回到列表
  await win.webContents.executeJavaScript('document.querySelector(".trash .back").click(); true')
  await sleep(400)

  /* ---------- 8. 窄窗口布局 ---------- */
  win.setSize(520, 420)
  await sleep(600)
  const narrow = await win.webContents.executeJavaScript(`(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    titlebar: document.querySelector('.titlebar') ? document.querySelector('.titlebar').scrollWidth : 0,
    width: window.innerWidth
  }))()`)
  check('520px 窄窗口不横向溢出', narrow.overflow === false, JSON.stringify(narrow))
  win.setSize(780, 640)
  await sleep(400)

  /* ---------- 9. 编辑中切换标签 ---------- */
  await win.webContents.executeJavaScript(`(() => {
    const note = [...document.querySelectorAll('.note')].find((n) => n.textContent.includes('标签测试'));
    const btn = note && [...note.querySelectorAll('.actions button')].find((b) => b.textContent === '编辑');
    if (btn) btn.click();
    return !!btn;
  })()`)
  await sleep(300)
  await win.webContents.executeJavaScript(
    '[...document.querySelectorAll(".tag")].find((b) => b.textContent.includes("读书")).click(); true'
  )
  await sleep(500)
  const editSwitch = await win.webContents.executeJavaScript(`(() => ({
    editing: !!document.querySelector('.note.editing'),
    inList: document.querySelectorAll('.note').length
  }))()`)
  check('切换标签后不应残留编辑态', editSwitch.editing === false, JSON.stringify(editSwitch))

  console.log('\nrenderer errors:', errors.length)
  if (errors.length) console.log(errors.slice(0, 5).join('\n---\n'))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
  if (failed.length) console.log('失败项:\n' + failed.map((f) => ' - ' + f.name).join('\n'))

  db.close()
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
  } catch (_) {}
  app.quit()
})
