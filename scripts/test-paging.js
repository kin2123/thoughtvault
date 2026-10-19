// 分页验证：灌 300 条笔记，检查首屏渲染数量与滚动续载是否生效
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const tmp = path.join(os.tmpdir(), 'thoughtvault-page-' + Date.now())
app.setPath('userData', tmp)
require('./ui-env').tune(app)

const root = path.join(__dirname, '..')
const TOTAL = 300
const results = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function check(name, ok, extra) {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

app.whenReady().then(async () => {
  const db = require('../electron/db')
  const stub = require('./ipc-stub')
  const store = require('../electron/store')
  const config = require('../electron/config')

  db.open()
  const now = Date.now()
  db.importNotes(
    Array.from({ length: TOTAL }, (_, i) => ({
      id: 'n' + i,
      content: `第 ${i + 1} 条测试笔记，用来验证分页加载 #压测`,
      tags: ['压测'],
      createdAt: now - i * 60000,
      updatedAt: now - i * 60000
    }))
  )

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
  await sleep(1600)

  const t0 = Date.now()
  const first = await win.webContents.executeJavaScript(
    '({ rendered: document.querySelectorAll(".note").length, more: !!document.querySelector(".more") })'
  )
  const firstMs = Date.now() - t0
  check(`首屏只渲染 80 条（共 ${TOTAL} 条）`, first.rendered === 80, 'rendered=' + first.rendered)
  check('底部出现「还有更多」提示', first.more)
  console.log(`首屏渲染耗时约 ${firstMs}ms（含脚本往返）`)

  // 滚到底触发续载
  await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('.list');
    el.scrollTop = el.scrollHeight;
    return true;
  })()`)
  await sleep(700)
  const second = await win.webContents.executeJavaScript(
    'document.querySelectorAll(".note").length'
  )
  check('滚到底后追加到 160 条', second === 160, 'rendered=' + second)

  // 再滚一次
  await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('.list');
    el.scrollTop = el.scrollHeight;
    return true;
  })()`)
  await sleep(700)
  const third = await win.webContents.executeJavaScript(
    'document.querySelectorAll(".note").length'
  )
  check('再滚一次到 240 条', third === 240, 'rendered=' + third)

  // 一直滚到最后，确认能取到全部 300 条
  for (let i = 0; i < 3; i++) {
    await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('.list');
      el.scrollTop = el.scrollHeight;
      return true;
    })()`)
    await sleep(600)
  }
  const last = await win.webContents.executeJavaScript(`({
    rendered: document.querySelectorAll('.note').length,
    more: !!document.querySelector('.more')
  })`)
  check('最终能加载完全部 300 条', last.rendered === TOTAL, 'rendered=' + last.rendered)
  check('加载完后不再提示更多', !last.more)

  // 搜索时会重置分页
  await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('.search');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '第 1 条');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`)
  await sleep(900)
  const searched = await win.webContents.executeJavaScript(
    'document.querySelectorAll(".note").length'
  )
  check('搜索后分页重置', searched <= 20, 'rendered=' + searched)

  console.log(`\n合计 ${results.length} 项，通过 ${results.filter(Boolean).length}`)
  db.close()
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
  } catch (_) {}
  app.quit()
})
