// 第二批边界测试：连续操作、空态、批量标签、极端时间戳、图片类型
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const tmp = path.join(os.tmpdir(), 'tv-edge2-' + Date.now())
app.setPath('userData', tmp)
require('./ui-env').tune(app)

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
  const assets = require('../electron/assets')
  require('./ipc-stub').install({ db, store, config, tmp })
  db.open()

  const win = new BrowserWindow({
    width: 780, height: 640, show: true, backgroundColor: '#101014',
    webPreferences: { preload: path.join(root, 'electron', 'preload.js'), contextIsolation: true }
  })
  const errors = []
  win.webContents.on('console-message', (_e, l, m) => { if (l >= 2) errors.push(m) })
  await win.loadFile(path.join(root, 'dist', 'index.html'))
  await sleep(1400)

  /* 1. 空库时键盘操作 */
  const emptyKeys = await win.webContents.executeJavaScript(`(async () => {
    for (const k of ['ArrowDown', 'ArrowUp', 'Enter']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    }
    await new Promise((r) => setTimeout(r, 100));
    return document.querySelectorAll('.note').length;
  })()`)
  check('空列表按方向键/回车不崩', emptyKeys === 0 && errors.length === 0, 'errors=' + errors.length)

  /* 2. 连续快速保存 10 条 */
  await win.webContents.executeJavaScript(`(async () => {
    const ta = document.querySelector('.composer textarea');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    for (let i = 0; i < 10; i++) {
      setter.call(ta, '连打测试第 ' + i + ' 条');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));
      document.querySelector('.composer .save').click();
      await new Promise((r) => setTimeout(r, 60));
    }
  })()`)
  await sleep(900)
  const tenOk = await win.webContents.executeJavaScript('document.querySelectorAll(".note").length')
  check('连打 10 条全部落库', db.getStats().active === 10, 'db=' + db.getStats().active + ' dom=' + tenOk)
  check('连打后草稿已清空', store.loadDraft() === '')

  /* 3. 批量打标签：重复执行不产生重复标签 */
  const ids = db.listNotes({}).map((n) => n.id)
  await win.webContents.executeJavaScript(`(async () => {
    await window.vault.addTags(${JSON.stringify(ids)}, ['批测']);
    await window.vault.addTags(${JSON.stringify(ids)}, ['批测']);
  })()`)
  await sleep(400)
  const tagRows = db.listTags().find((t) => t.name === '批测')
  const oneContent = db.getNote(ids[0]).content
  check('重复打同一标签不会翻倍', tagRows && tagRows.count === ids.length, JSON.stringify(tagRows))
  check('正文里标签只加一次', (oneContent.match(/#批测/g) || []).length === 1, oneContent.slice(-20))

  /* 4. 极端时间戳导入 */
  const weird = db.importNotes([
    { content: '负时间戳', createdAt: -99999, updatedAt: -99999 },
    { content: '字符串时间戳', createdAt: 'abc', updatedAt: 'abc' },
    { content: 'NaN 时间戳', createdAt: NaN, updatedAt: NaN }
  ])
  const weirdNotes = db.listNotes({ query: '时间戳' })
  const allNumeric = weirdNotes.every((n) => Number.isFinite(n.createdAt) && Number.isFinite(n.updatedAt))
  check('极端时间戳被纠正为有效数字', weird.added === 3 && allNumeric, JSON.stringify(weirdNotes.map((n) => n.createdAt)))
  const sortOk = db.listNotes({ sort: 'created' }).length > 0
  check('异常时间戳不影响排序', sortOk)

  /* 5. 图片类型白名单 */
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
  const res = assets.save(path.join(tmp, 'assets'), svg, 'svg')
  check('不支持的图片格式被拒绝', res.ok === false && !!res.error, JSON.stringify(res))
  const okPng = assets.save(path.join(tmp, 'assets'), Buffer.from([137, 80, 78, 71]), 'png')
  check('png 正常保存', okPng.ok === true, okPng.url)

  /* 6. 搜索后分组标题与结果日期一致 */
  const groupOk = await win.webContents.executeJavaScript(`(async () => {
    const el = document.querySelector('.search');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '连打测试第 1 条');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    const heads = [...document.querySelectorAll('.group-head .g-label')].map((e) => e.textContent.trim());
    return { heads, notes: document.querySelectorAll('.note').length };
  })()`)
  check('搜索结果按月日分组正常', groupOk.notes === 1 && groupOk.heads[0] === '今天', JSON.stringify(groupOk))

  console.log('\nrenderer errors:', errors.length)
  if (errors.length) console.log(errors.slice(0, 3).join('\n'))
  const failed = results.filter((r) => !r.ok)
  console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
  if (failed.length) console.log('失败项:\n' + failed.map((f) => ' - ' + f.name).join('\n'))

  db.close()
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 }) } catch (_) {}
  app.quit()
})
