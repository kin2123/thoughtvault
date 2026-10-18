// 多选批量删除验证
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const tmp = path.join(os.tmpdir(), 'thoughtvault-batch-' + Date.now())
app.setPath('userData', tmp)
app.disableHardwareAcceleration()

const root = path.join(__dirname, '..')
const results = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function check(name, ok, extra) {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

app.whenReady().then(async () => {
  const db = require('../electron/db')
  const store = require('../electron/store')
  const config = require('../electron/config')
  const stub = require('./ipc-stub')

  db.open()
  const now = Date.now()
  db.importNotes(
    Array.from({ length: 5 }, (_, i) => ({
      id: 'x' + i,
      content: `待批量删除的第 ${i + 1} 条`,
      tags: [],
      createdAt: now - i * 1000,
      updatedAt: now - i * 1000
    }))
  )

  stub.install({ db, store, config, tmp })

  const win = new BrowserWindow({
    width: 780,
    height: 640,
    show: true,
    backgroundColor: '#141418',
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

  const before = db.getStats().active
  check('初始 5 条', before === 5, 'active=' + before)

  // 进入多选
  await win.webContents.executeJavaScript(
    '[...document.querySelectorAll(".chip-btn")].find((b) => b.textContent.trim() === "多选").click(); true'
  )
  await sleep(300)

  // 勾选前两条
  await win.webContents.executeJavaScript(`(() => {
    const notes = [...document.querySelectorAll('.note')];
    notes[0].click();
    notes[1].click();
    return true;
  })()`)
  await sleep(300)
  const selText = await win.webContents.executeJavaScript(
    'document.querySelector(".batch-count") ? document.querySelector(".batch-count").textContent : ""'
  )
  check('选中 2 条', selText.includes('2'), selText)

  // 点删除
  await win.webContents.executeJavaScript(`(() => {
    const btn = [...document.querySelectorAll('.batch-btn')].find((b) => b.textContent.trim() === '删除');
    if (!btn) return false;
    btn.click();
    return true;
  })()`)
  await sleep(900)

  const after = db.getStats().active
  const trash = db.getStats().trash
  check('批量删除真的落库', after === 3 && trash === 2, `active=${after} trash=${trash}`)

  const listCount = await win.webContents.executeJavaScript(
    'document.querySelectorAll(".note").length'
  )
  check('列表同步刷新', listCount === 3, 'rendered=' + listCount)

  const toast = await win.webContents.executeJavaScript(
    'document.querySelector(".toast-text") ? document.querySelector(".toast-text").textContent : ""'
  )
  check('有结果提示', toast.includes('删除'), toast)

  console.log('renderer errors:', errors.length)
  if (errors.length) console.log(errors.slice(0, 3).join('\n'))
  console.log(`\n合计 ${results.length} 项，通过 ${results.filter(Boolean).length}`)

  db.close()
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
  } catch (_) {}
  app.quit()
})
