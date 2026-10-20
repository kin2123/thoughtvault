// 新增功能的界面级测试：搜索高亮 / 批量撤销 / 回收站倒计时 / 单条导出 /
// 强调色与密度 / 拖拽图片。跑真实构建产物 + 真实 SQLite。
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const tmp = path.join(os.tmpdir(), 'tv-uifeat-' + Date.now())
app.setPath('userData', tmp)
require('./ui-env').tune(app)

const root = path.join(__dirname, '..')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
function check(name, ok, extra) {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

app.whenReady().then(async () => {
  const db = require('../electron/db')
  const store = require('../electron/store')
  const config = require('../electron/config')
  require('./ipc-stub').install({ db, store, config, tmp })
  db.open()

  db.createNote({ content: '今天学习 SQLite 的索引 #开发' })
  db.createNote({ content: '读书笔记：注意力残留比打断更贵 #读书' })
  db.createNote({ content: '第三条，用来做批量删除 #临时' })

  // 抓一下导出内容，验证单条导出写的是什么
  let exported = null
  ipcMain.removeHandler('export:file')
  ipcMain.handle('export:file', (_e, payload) => {
    exported = payload
    return { ok: true, path: 'C:/tmp/exported.md' }
  })

  const win = new BrowserWindow({
    width: 820,
    height: 680,
    show: true,
    backgroundColor: '#101014',
    webPreferences: { preload: path.join(root, 'electron', 'preload.js'), contextIsolation: true }
  })
  const errors = []
  win.webContents.on('console-message', (_e, l, m) => {
    if (l >= 2) errors.push(m)
  })
  await win.loadFile(path.join(root, 'dist', 'index.html'))
  await sleep(1400)

  const run = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`)

  /* 1. 搜索高亮 */
  const hl = await run(`
    const s = document.querySelector('.search');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(s, '学习');
    s.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    const marks = [...document.querySelectorAll('mark.tv-hl')].map(m => m.textContent);
    return { count: marks.length, text: marks.join('|'), notes: document.querySelectorAll('.note').length };
  `)
  check('搜索命中被高亮', hl.count >= 1 && hl.text.includes('学习'), JSON.stringify(hl))

  const cleared = await run(`
    const s = document.querySelector('.search');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(s, '');
    s.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    return document.querySelectorAll('mark.tv-hl').length;
  `)
  check('清空关键词后高亮消失', cleared === 0, 'marks=' + cleared)

  /* 2. 批量删除 + 撤销 */
  const before = db.getStats().active
  await run(`
    const sel = [...document.querySelectorAll('.chip-btn')].find(b => b.textContent.trim() === '多选');
    sel.click();
    await new Promise(r => setTimeout(r, 250));
    document.querySelectorAll('.note')[0].click();
    document.querySelectorAll('.note')[1].click();
    await new Promise(r => setTimeout(r, 150));
    document.querySelector('.batchbar .batch-btn.danger').click();
    await new Promise(r => setTimeout(r, 700));
  `)
  await sleep(600)
  const afterDel = db.getStats().active
  check('批量删除生效', afterDel === before - 2, `${before} -> ${afterDel}`)

  const undoClicked = await run(`
    const b = document.querySelector('.toast-action');
    if (!b) return false;
    b.click();
    await new Promise(r => setTimeout(r, 900));
    return true;
  `)
  await sleep(900)
  check('批量删除可撤销', undoClicked === true && db.getStats().active === before, 'active=' + db.getStats().active)

  /* 3. 回收站倒计时 */
  const trashNote = db.createNote({ content: '回收站倒计时测试 #t' })
  db.softDelete(trashNote.id)
  const trash = await run(`
    [...document.querySelectorAll('.icon-btn')].find(b => b.textContent.includes('回收站')).click();
    await new Promise(r => setTimeout(r, 700));
    return [...document.querySelectorAll('.expire')].map(e => e.textContent.trim());
  `)
  check(
    '回收站显示剩余天数',
    trash.length > 0 && trash.every((t) => /天|即将/.test(t)),
    JSON.stringify(trash)
  )
  await run(`document.querySelector('.back').click(); await new Promise(r => setTimeout(r, 500));`)

  /* 4. 单条导出 */
  const exp = await run(`
    const btn = [...document.querySelectorAll('.note .actions button')].find(b => b.textContent.trim() === '导出');
    if (!btn) return { ok: false };
    btn.click();
    await new Promise(r => setTimeout(r, 600));
    return { ok: true, toast: (document.querySelector('.toast-text') || {}).textContent || '' };
  `)
  const allContents = db.listNotes({}).map((n) => n.content)
  check(
    '卡片上的导出只写这一条',
    exp.ok === true &&
      exported &&
      allContents.includes(exported.content.trim()) &&
      !exported.content.includes('思库导出'),
    JSON.stringify({ exp, len: exported && exported.content.length })
  )

  /* 5. 强调色与密度：改完立即生效并落盘 */
  const look = await run(`
    [...document.querySelectorAll('.icon-btn')].find(b => b.textContent.trim() === '设置').click();
    await new Promise(r => setTimeout(r, 350));
    document.querySelector('.swatch[title="蓝"]').click();
    await new Promise(r => setTimeout(r, 350));
    const accent = document.documentElement.dataset.accent;
    const accentVar = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    [...document.querySelectorAll('.segs button')].find(b => b.textContent.trim() === '紧凑').click();
    await new Promise(r => setTimeout(r, 350));
    const density = document.documentElement.dataset.density;
    const gap = getComputedStyle(document.documentElement).getPropertyValue('--note-gap').trim();
    const saved = await window.vault.getConfig();
    return { accent, accentVar, density, gap, savedAccent: saved.accent, savedDensity: saved.density };
  `)
  check(
    '切换强调色立即生效',
    look.accent === 'blue' && /#6b8afd/i.test(look.accentVar),
    JSON.stringify(look)
  )
  check(
    '切换密度立即生效并落盘',
    look.density === 'compact' && look.gap === '4px' && look.savedDensity === 'compact',
    JSON.stringify({ density: look.density, gap: look.gap, saved: look.savedDensity })
  )

  /* 6. 拖拽图片入窗 */
  await run(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
             await new Promise(r => setTimeout(r, 300));`)
  const dropped = await run(`
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const file = new File([bytes], 'drag.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ta = document.querySelector('.composer textarea');
    ta.focus();
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 900));
    return ta.value;
  `)
  const assetFiles = (() => {
    try {
      return fs.readdirSync(path.join(tmp, 'assets'))
    } catch (_) {
      return []
    }
  })()
  check(
    '拖拽图片会落盘并插入正文',
    dropped.includes('tv-asset://') && assetFiles.length === 1,
    JSON.stringify({ dropped: dropped.slice(0, 40), files: assetFiles })
  )

  /* 7. 卡片拆分后，样式与编辑流程仍然正常 */
  const cardStyle = await run(`
    const note = document.querySelector('.note');
    const cs = getComputedStyle(note);
    return { padTop: cs.paddingTop, radius: cs.borderRadius, bg: cs.backgroundColor };
  `)
  check(
    '卡片样式仍然生效',
    cardStyle.padTop === '7px' && cardStyle.radius === '12px' && cardStyle.bg !== 'rgba(0, 0, 0, 0)',
    JSON.stringify(cardStyle)
  )

  const enterEdit = await run(`
    const note = document.querySelector('.note');
    const btn = [...note.querySelectorAll('.actions button')].find(b => b.textContent.trim() === '编辑');
    if (!btn) return { has: false };
    btn.click();
    await new Promise(r => setTimeout(r, 350));
    const ta = document.querySelector('.note.editing textarea');
    return { has: !!ta, value: ta ? ta.value : '' };
  `)
  check('进入编辑态带上原内容', enterEdit.has === true && enterEdit.value.length > 0, JSON.stringify(enterEdit).slice(0, 80))

  await run(`
    const ta = document.querySelector('.note.editing textarea');
    ta.value = '改过的内容 #edited';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
  `)
  check('Ctrl+Enter 能保存编辑', db.listNotes({}).some((n) => n.content.includes('改过的内容')), 'db ok')

  check('全程没有渲染层报错', errors.length === 0, errors.slice(0, 2).join(' | '))

  console.log(`\n合计 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
  db.close()
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
  } catch (_) {}
  app.exit(fail ? 1 : 0)
})
