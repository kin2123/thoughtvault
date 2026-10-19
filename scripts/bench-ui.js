// 界面渲染基线：量「切筛选 / 切排序 / 首屏 / 续载」的真实耗时
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const tmp = path.join(os.tmpdir(), 'thoughtvault-ubench-' + Date.now())
app.setPath('userData', tmp)
app.disableHardwareAcceleration()

const root = path.join(__dirname, '..')
const N = Number(process.env.BENCH_N || 500)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const db = require('../electron/db')
  const stub = require('./ipc-stub')
  const store = require('../electron/store')
  const config = require('../electron/config')

  db.open()
  const now = Date.now()
  const seed = []
  for (let i = 0; i < N; i++) {
    seed.push({
      id: 'u' + i,
      content: `第 ${i} 条笔记：今天学习 SQLite 的 FTS5 索引，顺手记一些 **加粗** 和 \`代码\` 的内容。\n\n- 列表项一\n- 列表项二 #开发`,
      tags: i % 2 === 0 ? ['开发'] : ['读书'],
      createdAt: now - i * 60000,
      updatedAt: now - i * 60000
    })
  }
  db.importNotes(seed)

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

  const t0 = Date.now()
  await win.loadFile(path.join(root, 'dist', 'index.html'))
  // 等列表渲染出来
  for (let i = 0; i < 60; i++) {
    const c = await win.webContents.executeJavaScript('document.querySelectorAll(".note").length')
    if (c > 0) break
    await sleep(50)
  }
  console.log(`首屏可交互（到列表出现）              ${(Date.now() - t0).toString().padStart(6)} ms`)

  const measure = async (label, js) => {
    const ms = await win.webContents.executeJavaScript(`(async () => {
      const t = performance.now();
      ${js}
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t;
    })()`)
    console.log(`${label.padEnd(28)} ${ms.toFixed(1).padStart(8)} ms`)
    return ms
  }

  await measure(
    '切标签（全部→开发）',
    `[...document.querySelectorAll('.tag')].find((b) => b.textContent.includes('开发')).click();`
  )
  await measure(
    '切回全部',
    `[...document.querySelectorAll('.tag')].find((b) => b.textContent.trim() === '全部').click();`
  )
  await measure(
    '切排序（更新→创建）',
    `[...document.querySelectorAll('.chip-btn')].find((b) => b.textContent.includes('最近更新')).click();`
  )
  await measure('滚到底续载一页', `(() => { const el = document.querySelector('.list'); el.scrollTop = el.scrollHeight; })()`)

  const rendered = await win.webContents.executeJavaScript('document.querySelectorAll(".note").length')
  console.log(`当前渲染卡片数                ${rendered}`)

  db.close()
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
  } catch (_) {}
  app.quit()
})
