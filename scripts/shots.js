// 生成亮/暗两套界面截图（演示数据）
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const tmp = path.join(os.tmpdir(), 'thoughtvault-shots-' + Date.now())
app.setPath('userData', tmp)
require('./ui-env').tune(app)

const root = path.join(__dirname, '..')
const outDir = path.join(root, '.workbuddy')
fs.mkdirSync(outDir, { recursive: true })
const DAY = 86400000

app.whenReady().then(async () => {
  const db = require('../electron/db')
  const store = require('../electron/store')
  const config = require('../electron/config')

  db.open()
  const now = Date.now()
  db.importNotes([
    {
      id: 's1',
      content:
        'SQLite 那边的中文分词想通了：FTS5 的 unicode61 把连续汉字当一个 token，所以写入和查询都要先给每个字插空格。\n\n搜「学习」查的是 `"学 习"` 短语，要求相邻。 #开发',
      tags: ['开发'],
      createdAt: now - 40 * 60000,
      updatedAt: now - 40 * 60000,
      pinned: true
    },
    {
      id: 's2',
      content: '把「分页」和「能找到东西」区分开：分页是渲染护栏，找东西靠分组和搜索。 #设计',
      tags: ['设计'],
      createdAt: now - 3 * 3600000,
      updatedAt: now - 3 * 3600000
    },
    {
      id: 's3',
      content: '《深度工作》：注意力残留比被打断本身更贵。',
      tags: ['读书'],
      createdAt: now - 26 * 3600000,
      updatedAt: now - 26 * 3600000
    },
    {
      id: 's4',
      content: '- 备份改成 VACUUM INTO\n- 补 created_at 索引\n- 首屏合并成一次 IPC',
      tags: ['开发'],
      createdAt: now - 2 * DAY,
      updatedAt: now - 2 * DAY
    }
  ])

  require('./ipc-stub').install({
    db,
    store,
    config,
    tmp,
    opts: { config: { theme: 'dark', sort: 'updated' } }
  })

  const win = new BrowserWindow({
    width: 780,
    height: 660,
    show: true,
    backgroundColor: '#101014',
    webPreferences: {
      preload: path.join(root, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  await win.loadFile(path.join(root, 'dist', 'index.html'))
  await new Promise((r) => setTimeout(r, 1600))

  const shot = async (name) => {
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, name), img.toPNG())
    console.log('shot:', name)
  }

  await shot('ui-dark.png')

  // 点标题栏的太阳/月亮按钮切到亮色
  await win.webContents.executeJavaScript(
    'document.querySelector(".theme-btn").click(); true'
  )
  await new Promise((r) => setTimeout(r, 700))
  const theme = await win.webContents.executeJavaScript('document.documentElement.dataset.theme')
  console.log('切换后主题:', theme)
  await shot('ui-light.png')

  // 滚到设置面板的「数据」段，确认存储位置可编辑
  await win.webContents.executeJavaScript(
    'document.querySelector(\'button[title^="设置"]\').click(); true'
  )
  await new Promise((r) => setTimeout(r, 600))
  const scrolled = await win.webContents.executeJavaScript(`(() => {
    const body = document.querySelector('.panel .body');
    if (!body) return -1;
    body.scrollTop = body.scrollHeight;
    return body.scrollTop;
  })()`)
  await new Promise((r) => setTimeout(r, 400))
  console.log('面板已滚动到:', scrolled)
  await shot('ui-data.png')

  db.close()
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
  } catch (_) {}
  app.quit()
})
