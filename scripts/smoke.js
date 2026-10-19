// 无头渲染自检：加载真实构建产物 + 真实 SQLite，截三张图并跑六项端到端断言
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const tmp = path.join(os.tmpdir(), 'thoughtvault-smoke-' + Date.now())
app.setPath('userData', tmp)
require('./ui-env').tune(app)

const root = path.join(__dirname, '..')
const outDir = path.join(root, '.workbuddy')
fs.mkdirSync(outDir, { recursive: true })

// 自定义协议必须在 app ready 之前注册
require('../electron/assets').registerScheme()

const now = Date.now()
const SAMPLE = [
  {
    id: 'a1',
    content: '思库第四版：换成 **SQLite + FTS5**，中文搜索终于能用了。\n搜「学习」能搜到「今天学习」。\n\n- 列表项\n- `行内代码`\n\n```js\nconsole.log("hi")\n```\n#开发',
    tags: ['开发'],
    createdAt: now - 1000 * 60 * 8,
    updatedAt: now - 1000 * 60 * 8,
    pinned: true
  },
  {
    id: 'a2',
    content: '《深度工作》里那句：注意力残留比被打断本身更贵。#读书 #效率',
    tags: ['读书', '效率'],
    createdAt: now - 1000 * 60 * 60 * 3,
    updatedAt: now - 1000 * 60 * 60 * 3,
    pinned: false
  },
  {
    id: 'a3',
    content: '面试复盘：被问「为什么用 FastAPI 而不是 Flask」，只答了异步，没说依赖注入和 Pydantic 校验。',
    tags: [],
    createdAt: now - 1000 * 60 * 60 * 26,
    updatedAt: now - 1000 * 60 * 60 * 26,
    pinned: false
  },
  {
    id: 'a4',
    content: '这条已经删了，放在回收站里。',
    tags: [],
    createdAt: now - 1000 * 60 * 60 * 40,
    updatedAt: now - 1000 * 60 * 60 * 40,
    pinned: false,
    deletedAt: now - 1000 * 60 * 60 * 5
  }
]

app.whenReady().then(async () => {
  const db = require('../electron/db')
  const stub = require('./ipc-stub')
  const store = require('../electron/store')
  const config = require('../electron/config')
  const assets = require('../electron/assets')

  assets.handle(() => path.join(tmp, 'assets'))

  db.open()
  db.importNotes(SAMPLE)

  const stubOpts = { config: { onboarded: true } }
  stub.install({ db, store, config, tmp, opts: stubOpts })

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

  const errors = []
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(message)
    console.log('[renderer:' + level + ']', message)
  })
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.log('[fail-load]', code, desc)
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    await win.loadFile(path.join(root, 'dist', 'index.html'))
  }
  await new Promise((r) => setTimeout(r, 1600))

  const shot = async (name) => {
    const img = await win.webContents.capturePage()
    const file = path.join(outDir, name)
    fs.writeFileSync(file, img.toPNG())
    console.log('shot:', name, fs.statSync(file).size, 'bytes')
  }

  await shot('shot-list.png')

  /* Markdown 渲染 + 多选模式 */
  const mdInfo = await win.webContents.executeJavaScript(`(() => ({
    strong: !!document.querySelector('.md-body strong'),
    code: !!document.querySelector('.md-body pre code'),
    list: !!document.querySelector('.md-body ul li'),
    mdCount: document.querySelectorAll('.md-body').length
  }))()`)
  check('Markdown 渲染', mdInfo.strong && mdInfo.code && mdInfo.list, JSON.stringify(mdInfo))

  await win.webContents.executeJavaScript(
    '[...document.querySelectorAll(".chip-btn")].find((b) => b.textContent.trim() === "多选").click(); true'
  )
  await sleep(300)
  const checkCount = await win.webContents.executeJavaScript(
    'document.querySelectorAll(".note .check").length'
  )
  check('多选模式出现勾选框', checkCount > 0, 'checks=' + checkCount)
  await win.webContents.executeJavaScript(
    '[...document.querySelectorAll(".chip-btn")].find((b) => b.textContent.includes("退出多选")).click(); true'
  )
  await sleep(250)

  await win.webContents.executeJavaScript(
    'document.querySelector(\'button[title^="设置"]\').click(); true'
  )
  await new Promise((r) => setTimeout(r, 700))
  await shot('shot-settings.png')

  const metrics = await win.webContents.executeJavaScript(`(() => {
    const p = document.querySelector('.panel');
    const b = document.querySelector('.panel .body');
    const r = p.getBoundingClientRect();
    return {
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
      panelBottom: Math.round(r.bottom),
      bodyClient: b.clientHeight,
      bodyScroll: b.scrollHeight
    };
  })()`)
  console.log('面板尺寸:', JSON.stringify(metrics))

  await win.webContents.executeJavaScript("document.querySelector('.panel .x').click(); true")
  await new Promise((r) => setTimeout(r, 300))

  await win.webContents.executeJavaScript(
    'document.querySelector(\'button[title="回收站"]\').click(); true'
  )
  await new Promise((r) => setTimeout(r, 500))
  await shot('shot-trash.png')

  /* 浅色主题验证 */
  await win.webContents.executeJavaScript('document.querySelector(\'.trash .back\').click(); true')
  await sleep(400)
  await win.webContents.executeJavaScript('document.querySelector(\'button[title^="设置"]\').click(); true')
  await sleep(500)
  const switched = await win.webContents.executeJavaScript(`(() => {
    const btn = [...document.querySelectorAll('.segs button')].find((b) => b.textContent.trim() === '浅色');
    if (!btn) return false;
    btn.click();
    return true;
  })()`)
  await sleep(500)
  await win.webContents.executeJavaScript("document.querySelector('.panel .x').click(); true")
  await sleep(400)
  const themeNow = await win.webContents.executeJavaScript('document.documentElement.dataset.theme')
  check('切换到浅色主题', switched && themeNow === 'light', 'theme=' + themeNow)
  const colors = await win.webContents.executeJavaScript(`(() => {
    const pre = document.querySelector('.md-body pre');
    const app = document.querySelector('.app');
    const cs = pre ? getComputedStyle(pre) : null;
    return {
      appBg: getComputedStyle(app).backgroundColor,
      preBg: cs ? cs.backgroundColor : 'no-pre',
      preColor: cs ? cs.color : 'no-pre',
      surface2: getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim()
    };
  })()`)
  console.log('浅色配色:', JSON.stringify(colors))
  await shot('shot-light.png')

  /* ---------- 功能自检 ---------- */

  const setInput = (sel, text) => `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(text)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`

  const before = db.getStats().active
  await win.webContents.executeJavaScript(setInput('.composer textarea', '自检写入一条 #测试'))
  await sleep(250)
  await win.webContents.executeJavaScript("document.querySelector('.composer .save').click(); true")
  await sleep(700)

  const after = db.getStats().active
  check('保存笔记落库', after === before + 1, `${before} → ${after}`)
  check('保存后清草稿', store.loadDraft() === '')

  const found = db.listNotes({ query: '自检写入' })
  check('中文搜索命中新笔记', found.length === 1)

  await win.webContents.executeJavaScript(`(() => {
    const t = [...document.querySelectorAll('.note')].find((n) => n.textContent.includes('自检写入'));
    if (!t) return false;
    t.querySelector('.actions .danger').click();
    return true;
  })()`)
  await sleep(700)
  check('软删除进回收站', db.listTrash().some((n) => n.content.includes('自检写入')))

  await win.webContents.executeJavaScript("document.querySelector('.toast-action').click(); true")
  await sleep(700)
  check('撤销删除', !db.listTrash().some((n) => n.content.includes('自检写入')))

  await win.webContents.executeJavaScript(setInput('.composer textarea', '没按回车就关窗口的内容'))
  await sleep(900)
  check('草稿自动落盘', store.loadDraft().includes('没按回车'))

  const bak = db.backupTo(path.join(tmp, 'backups'))
  check('备份生成 .db', bak.ok && fs.existsSync(bak.path), bak.ok ? bak.name : bak.error)

  /* 图片：落盘 + 自定义协议可读取 */
  const imgTest = await win.webContents.executeJavaScript(`(async () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const png = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const res = await window.vault.saveAsset({ buffer: png, ext: 'png' });
    if (!res || !res.ok) return { ok: false, err: res && res.error };
    const loaded = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth === 1);
      img.onerror = () => resolve(false);
      img.src = res.url;
    });
    return { ok: loaded, url: res.url };
  })()`)
  check('图片落盘且可通过 tv-asset 读取', imgTest.ok, JSON.stringify(imgTest))

  /* 首次引导（重载窗口模拟首次启动） */
  stubOpts.config.onboarded = false
  await win.webContents.reload()
  await sleep(1800)
  const onboard = await win.webContents.executeJavaScript(`(() => {
    const card = document.querySelector('.onboard .card');
    return { shown: !!card, text: card ? card.textContent.slice(0, 12) : '' };
  })()`)
  check('首次启动显示引导', onboard.shown, onboard.text)
  await shot('shot-onboard.png')
  await win.webContents.executeJavaScript("document.querySelector('.onboard .know').click(); true")
  await sleep(400)
  const gone = await win.webContents.executeJavaScript('!document.querySelector(".onboard")')
  check('引导可关闭', gone)

  console.log('renderer errors:', errors.length)
  if (errors.length) console.log(errors.join('\n---\n'))

  db.close()
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
  } catch (_) {
    // 缓存目录偶尔被占用，清理失败不影响结论
  }
  app.quit()
})

const results = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function check(name, ok, extra) {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}
