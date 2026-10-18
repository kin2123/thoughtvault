// 时间分组与键盘导航验证
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const tmp = path.join(os.tmpdir(), 'thoughtvault-group-' + Date.now())
app.setPath('userData', tmp)
app.disableHardwareAcceleration()

const root = path.join(__dirname, '..')
const results = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function check(name, ok, extra) {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

const DAY = 86400000

app.whenReady().then(async () => {
  const db = require('../electron/db')
  const stub = require('./ipc-stub')
  const store = require('../electron/store')
  const config = require('../electron/config')

  db.open()
  const now = Date.now()
  const mk = (id, daysAgo, hoursAgo, content) => ({
    id,
    content,
    tags: [],
    createdAt: now - daysAgo * DAY - hoursAgo * 3600000,
    updatedAt: now - daysAgo * DAY - hoursAgo * 3600000
  })
  db.importNotes([
    mk('t1', 0, 1, '今天的第一条'),
    mk('t2', 0, 3, '今天的第二条'),
    mk('y1', 1, 2, '昨天的'),
    mk('d3', 3, 2, '三天前的'),
    mk('o10a', 10, 2, '十天前的 A'),
    mk('o10b', 10, 5, '十天前的 B'),
    mk('o40', 40, 2, '四十天前的')
  ])

  stub.install({ db, store, config, tmp })

  const win = new BrowserWindow({
    width: 780,
    height: 640,
    show: false,
    backgroundColor: '#141418',
    webPreferences: {
      preload: path.join(root, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  await win.loadFile(path.join(root, 'dist', 'index.html'))
  await sleep(1500)

  const labels = await win.webContents.executeJavaScript(
    '[...document.querySelectorAll(".group-head .g-label")].map((e) => e.textContent.trim())'
  )
  check('分组标题数量为 5', labels.length === 5, JSON.stringify(labels))
  check('第一组是今天', labels[0] === '今天', labels[0])
  check('第二组是昨天', labels[1] === '昨天', labels[1])
  check('旧分组显示月日与星期', /\d+月\d+日 周./.test(labels[2]), labels[2])

  const visible1 = await win.webContents.executeJavaScript(
    'document.querySelectorAll(".note").length'
  )
  check('7 天前的分组默认收起（只渲染 4 条）', visible1 === 4, 'rendered=' + visible1)

  const collapsedHead = await win.webContents.executeJavaScript(`(() => {
    const heads = [...document.querySelectorAll('.group-head')];
    const target = heads.find((h) => h.querySelector('.g-label').textContent.includes('40年') || h === heads[heads.length - 1]);
    target.click();
    return true;
  })()`)
  await sleep(400)
  const visible2 = await win.webContents.executeJavaScript(
    'document.querySelectorAll(".note").length'
  )
  check('点击收起的分组可以展开', collapsedHead && visible2 === 5, 'rendered=' + visible2)

  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(root, '.workbuddy', 'shot-groups.png'), img.toPNG())
  console.log('shot: shot-groups.png')

  // 再点一次收起
  await win.webContents.executeJavaScript(`(() => {
    const heads = [...document.querySelectorAll('.group-head')];
    heads[heads.length - 1].click();
    return true;
  })()`)
  await sleep(350)
  const visible3 = await win.webContents.executeJavaScript(
    'document.querySelectorAll(".note").length'
  )
  check('再点一次重新收起', visible3 === 4, 'rendered=' + visible3)

  /* 键盘导航 */
  const press = (key) =>
    win.webContents.executeJavaScript(
      `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true })); true`
    )

  await press('ArrowDown')
  await sleep(250)
  const a1 = await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('.note.active');
    return el ? el.dataset.id : '';
  })()`)
  check('方向键选中第一条', a1 === 't1', 'active=' + a1)

  await press('ArrowDown')
  await sleep(200)
  const a2 = await win.webContents.executeJavaScript(
    "document.querySelector('.note.active') ? document.querySelector('.note.active').dataset.id : ''"
  )
  check('再按一次下移到第二条', a2 === 't2', 'active=' + a2)

  await press('ArrowUp')
  await sleep(200)
  const a3 = await win.webContents.executeJavaScript(
    "document.querySelector('.note.active') ? document.querySelector('.note.active').dataset.id : ''"
  )
  check('上移回到第一条', a3 === 't1', 'active=' + a3)

  await press('Enter')
  await sleep(400)
  const editing = await win.webContents.executeJavaScript(
    '!!document.querySelector(".note.editing textarea")'
  )
  check('回车进入编辑态', editing)

  console.log(`\n合计 ${results.length} 项，通过 ${results.filter(Boolean).length}`)
  db.close()
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
  } catch (_) {}
  app.quit()
})
