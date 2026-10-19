const {
  app,
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  dialog,
  shell,
  screen
} = require('electron')
const fs = require('fs')
const path = require('path')
const store = require('./store')
const config = require('./config')
const db = require('./db')
const paths = require('./paths')
const { createRelocator } = require('./relocate')
const assets = require('./assets')
const nav = require('./nav')

// 必须在 app ready 之前注册，否则自定义协议拿不到安全上下文
assets.registerScheme()

const DEV_URL = process.env.VITE_DEV_SERVER_URL

let win = null
let tray = null
let quitting = false
let cfg = null
let activeHotkey = null
let suppressBlurHide = false
let boundsTimer = null

// 纯文本工具用不上硬件加速，关掉能显著降低内存与老显卡/虚拟机的崩溃率。
// 需要开回来时设环境变量 APP_GPU=1。
if (process.env.APP_GPU !== '1') {
  app.disableHardwareAcceleration()
}

function iconPath() {
  return path.join(__dirname, '..', 'build', 'icon.png')
}

function logLine(msg) {
  try {
    const dir = paths.logs()
    fs.mkdirSync(dir, { recursive: true })
    const line = `[${new Date().toISOString()}] ${msg}\n`
    fs.appendFileSync(path.join(dir, 'app.log'), line, 'utf-8')
  } catch (_) {}
}

/* ---------- 图片资源 ---------- */

function registerAssetProtocol() {
  assets.handle(() => store.assetsDir())
}

function saveAsset(buffer, ext = 'png') {
  return assets.save(store.assetsDir(), buffer, ext)
}

/* ---------- 窗口位置 ---------- */

function resolveBounds() {
  const saved = (cfg && cfg.window) || {}
  const width = Number(saved.width) || 780
  const height = Number(saved.height) || 600
  if (typeof saved.x !== 'number' || typeof saved.y !== 'number') {
    return { width, height }
  }
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return (
      saved.x < a.x + a.width - 120 &&
      saved.x + width > a.x + 120 &&
      saved.y < a.y + a.height - 80 &&
      saved.y + height > a.y + 40
    )
  })
  if (!visible) return { width, height }
  return { x: saved.x, y: saved.y, width, height }
}

function rememberBounds() {
  if (!win || !cfg) return
  if (win.isMinimized() || win.isMaximized() || win.isFullScreen()) return
  const b = win.getBounds()
  cfg.window = { x: b.x, y: b.y, width: b.width, height: b.height }
  config.save(cfg)
}

function scheduleRememberBounds() {
  clearTimeout(boundsTimer)
  boundsTimer = setTimeout(rememberBounds, 500)
}

/* ---------- 快捷键 ---------- */

function registerHotkey(accel, fallback) {
  const previous = activeHotkey || fallback || null
  try {
    if (previous) globalShortcut.unregister(previous)
    const ok = globalShortcut.register(accel, toggle)
    if (ok) {
      activeHotkey = accel
      return { ok: true, hotkey: accel }
    }
    if (previous) {
      globalShortcut.register(previous, toggle)
      activeHotkey = previous
    }
    return { ok: false, error: '这个组合已被其他程序占用，换一个试试', hotkey: activeHotkey }
  } catch (err) {
    if (previous) {
      try {
        globalShortcut.register(previous, toggle)
      } catch (_) {}
      activeHotkey = previous
    }
    return { ok: false, error: '无法识别的快捷键组合', hotkey: activeHotkey }
  }
}

/* ---------- 导航边界 ---------- */

// 笔记里的 Markdown 链接是普通 <a href>，点一下会把整个窗口导航走，
// 而 preload 会在新页面重新注入——window.vault 那 30 多个 IPC 就交给了外站。
// 所以：只允许停留在自己的页面，外链一律交给系统浏览器。
function openExternal(url) {
  const safe = nav.externalUrl(url)
  if (!safe) return
  shell.openExternal(safe).catch((err) => logLine('打开外链失败: ' + err.message))
}

function hardenNavigation(w) {
  const opts = { devUrl: DEV_URL || '', appDir: path.join(__dirname, '..', 'dist') }

  w.webContents.on('will-navigate', (e, url) => {
    if (nav.isInternal(url, opts)) return
    e.preventDefault()
    openExternal(url)
  })

  // target="_blank" / window.open：不开新窗，直接外开
  w.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })

  // 本项目不用 webview，禁掉减少一个攻击面
  w.webContents.on('will-attach-webview', (e) => e.preventDefault())
}

/* ---------- 窗口 ---------- */

function createWindow() {
  const bounds = resolveBounds()

  win = new BrowserWindow({
    ...bounds,
    minWidth: 520,
    minHeight: 420,
    show: false,
    frame: false,
    backgroundColor: '#141418',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  hardenNavigation(win)
  Menu.setApplicationMenu(null)

  if (DEV_URL) {
    win.loadURL(DEV_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })

  win.on('resize', scheduleRememberBounds)
  win.on('move', scheduleRememberBounds)

  win.on('blur', () => {
    if (!win || quitting) return
    if (suppressBlurHide) return
    if (DEV_URL) return
    if (win.webContents.isDevToolsOpened()) return
    if (cfg && cfg.hideOnBlur === false) return
    win.hide()
  })

  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win.hide()
    }
  })

  win.webContents.on('render-process-gone', (_e, details) => {
    logLine('render-process-gone: ' + JSON.stringify(details))
  })
}

function toggle() {
  if (!win) return createWindow()
  if (win.isVisible() && win.isFocused()) {
    win.hide()
  } else {
    win.show()
    win.focus()
    win.webContents.send('window:focus-input')
  }
}

function openPanel(panel) {
  if (!win) return
  win.show()
  win.focus()
  win.webContents.send('ui:open', panel)
}

function createTray() {
  try {
    let image = nativeImage.createFromPath(iconPath())
    if (image.isEmpty()) image = nativeImage.createEmpty()
    tray = new Tray(image.resize({ width: 16, height: 16 }))
  } catch (err) {
    logLine('托盘创建失败: ' + err.message)
    return
  }
  tray.setToolTip('思库 · ' + (activeHotkey || ''))
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示 / 隐藏', click: toggle },
      { label: '新建笔记', click: () => openPanel('new') },
      { type: 'separator' },
      { label: '设置', click: () => openPanel('settings') },
      { label: '回收站', click: () => openPanel('trash') },
      {
        label: '立即备份',
        click: () => {
          const res = db.backupTo(store.backupsDir())
          if (res.ok) {
            store.pruneBackups()
            if (cfg) {
              cfg.lastBackupAt = res.at
              config.save(cfg)
            }
          }
          logLine(res.ok ? '手动备份: ' + res.name : '手动备份失败: ' + res.error)
        }
      },
      { label: '打开数据目录', click: () => shell.openPath(store.userDir()) },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitting = true
          rememberBounds()
          app.quit()
        }
      }
    ])
  )
  tray.on('click', toggle)
}

/* ---------- 配置 ---------- */

function publicConfig() {
  return {
    ...cfg,
    hotkeyActive: activeHotkey,
    appVersion: app.getVersion(),
    dataDir: paths.getBase(),
    isCustomDataDir: paths.isCustom(),
    defaultDataDir: app.getPath('userData'),
    backupsDir: store.backupsDir(),
    isPackaged: app.isPackaged
  }
}

function applyLaunchAtLogin(enabled) {
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: true })
  } catch (err) {
    logLine('设置开机自启失败: ' + err.message)
  }
}

/* ---------- 数据目录搬迁 ---------- */

const relocator = createRelocator({
  db,
  paths,
  saveConfig: (c) => config.save(c),
  log: (m) => logLine(m),
  askAttach: async () => {
    suppressBlurHide = true
    try {
      const choice = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['使用该目录的数据', '取消'],
        defaultId: 0,
        cancelId: 1,
        message: '目标目录里已经有一份笔记数据',
        detail:
          '选「使用该目录的数据」会切换过去，打开的是那份笔记。\n当前目录里的数据不会被删除。'
      })
      return choice.response === 0
    } finally {
      suppressBlurHide = false
    }
  }
})

/* ---------- IPC ---------- */

function registerIpc() {
  ipcMain.handle('data:pick', async () => {
    suppressBlurHide = true
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: '选择数据存放位置',
        properties: ['openDirectory', 'createDirectory']
      })
      if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true }
      return { ok: true, path: filePaths[0] }
    } finally {
      suppressBlurHide = false
    }
  })

  ipcMain.handle('data:relocate', (_e, target) => relocator.relocate(target, cfg))
  ipcMain.handle('data:reset', () => relocator.relocate(app.getPath('userData'), cfg))

  ipcMain.handle('config:get', () => publicConfig())

  ipcMain.handle('config:set', (_e, patch) => {
    const allowed = ['hideOnBlur', 'launchAtLogin', 'theme', 'fontSize', 'markdown', 'sort', 'onboarded']
    for (const key of allowed) {
      if (key in patch) cfg[key] = patch[key]
    }
    if ('launchAtLogin' in patch) applyLaunchAtLogin(cfg.launchAtLogin)
    config.save(cfg)
    return publicConfig()
  })

  ipcMain.handle('hotkey:set', (_e, accel) => {
    const res = registerHotkey(accel, cfg.hotkey)
    if (res.ok) {
      cfg.hotkey = accel
      config.save(cfg)
      if (tray) tray.setToolTip('思库 · ' + accel)
    }
    return res
  })

  ipcMain.handle('hotkey:reset', () => {
    const fallback = config.DEFAULTS.hotkey
    const res = registerHotkey(fallback, cfg.hotkey)
    if (res.ok) {
      cfg.hotkey = fallback
      config.save(cfg)
    }
    return res
  })

  /* 笔记 */
  ipcMain.handle('notes:bootstrap', (_e, opts) => db.bootstrap(opts || {}))
  ipcMain.handle('notes:list', (_e, opts) => db.listNotes(opts || {}))
  ipcMain.handle('notes:trash', () => db.listTrash())
  ipcMain.handle('notes:tags', () => db.listTags())
  ipcMain.handle('notes:stats', () => db.getStats())
  ipcMain.handle('notes:create', (_e, payload) => db.createNote(payload))
  ipcMain.handle('notes:update', (_e, id, payload) => db.updateNote(id, payload))
  ipcMain.handle('notes:pin', (_e, id, pinned) => db.setPinned(id, pinned))
  ipcMain.handle('notes:delete', (_e, id) => db.softDelete(id))
  ipcMain.handle('notes:restore', (_e, id) => db.restore(id))
  ipcMain.handle('notes:purge', (_e, id) => db.purge(id))
  ipcMain.handle('notes:emptyTrash', () => db.emptyTrash())
  ipcMain.handle('notes:exportAll', () => db.exportAll())
  ipcMain.handle('notes:batchDelete', (_e, ids) => db.batchSoftDelete(ids))
  ipcMain.handle('notes:renameTag', (_e, from, to) => db.renameTag(from, to))
  ipcMain.handle('notes:deleteTag', (_e, name) => db.deleteTag(name))
  ipcMain.handle('notes:addTags', (_e, ids, tags) => db.addTags(ids, tags))

  /* 图片 */
  ipcMain.handle('asset:save', (_e, payload) => {
    if (!payload || !payload.buffer) return { ok: false, error: '没有收到图片数据' }
    return saveAsset(Buffer.from(payload.buffer), payload.ext || 'png')
  })

  /* 草稿 */
  ipcMain.handle('draft:load', () => store.loadDraft())
  ipcMain.handle('draft:save', (_e, text) => store.saveDraft(text))
  ipcMain.handle('draft:clear', () => store.clearDraft())

  /* 备份 */
  ipcMain.handle('backup:now', () => {
    const res = db.backupTo(store.backupsDir())
    if (res.ok) {
      store.pruneBackups()
      cfg.lastBackupAt = res.at
      config.save(cfg)
    }
    return res
  })
  ipcMain.handle('backup:list', () => store.listBackups())

  ipcMain.handle('app:openDir', (_e, which) => {
    const target = which === 'backups' ? store.backupsDir() : store.userDir()
    return shell.openPath(target)
  })

  /* 导出：渲染层生成内容，主进程只负责弹框和落盘 */
  ipcMain.handle('export:file', async (_e, { defaultName, content }) => {
    suppressBlurHide = true
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: '导出',
        defaultPath: defaultName,
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'JSON', extensions: ['json'] }
        ]
      })
      if (canceled || !filePath) return { ok: false, canceled: true }
      fs.writeFileSync(filePath, content, 'utf-8')
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: err.message }
    } finally {
      suppressBlurHide = false
    }
  })

  ipcMain.handle('import:json', async () => {
    suppressBlurHide = true
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: '选择要导入的 JSON',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true }
      const raw = fs.readFileSync(filePaths[0], 'utf-8')
      const data = JSON.parse(raw)
      const notes = Array.isArray(data) ? data : data.notes
      if (!Array.isArray(notes)) return { ok: false, error: '文件里没有找到笔记数据' }
      const res = db.importNotes(notes)
      return { ok: true, path: filePaths[0], ...res }
    } catch (err) {
      return { ok: false, error: '读取失败：' + err.message }
    } finally {
      suppressBlurHide = false
    }
  })

  ipcMain.on('window:hide', () => win && win.hide())
  ipcMain.on('window:show', () => win && (win.show(), win.focus()))
}

/* ---------- 启动后的维护工作 ---------- */

// 完整性校验与备份都要占主线程：1 万条下完整校验 47~81ms、备份 15~30ms。
// 启动时它们既不该挡在 createWindow() 前面，也不该卡住渲染进程发来的首屏
// bootstrap 请求（那笔请求正是首屏要等的）。所以统一推迟到首屏渲染完之后。
let maintenanceDone = false

function runStartupMaintenance() {
  if (maintenanceDone) return
  maintenanceDone = true

  // 日常启动用快速校验就够：能抓到页损坏，代价只有完整校验的 1/3
  try {
    const ok = db.quickCheck()
    if (ok !== 'ok') logLine('数据库完整性异常: ' + ok)
  } catch (err) {
    logLine('完整性校验失败: ' + (err && err.message ? err.message : err))
  }

  try {
    const backup = db.backupTo(store.backupsDir())
    if (backup.ok) {
      store.pruneBackups()
      cfg.lastBackupAt = backup.at
      config.save(cfg)
    } else {
      logLine('启动备份失败: ' + backup.error)
    }
  } catch (err) {
    logLine('启动备份失败: ' + (err && err.message ? err.message : err))
  }
}

function scheduleStartupMaintenance() {
  if (win && !win.isDestroyed()) {
    win.webContents.once('did-finish-load', () => setImmediate(runStartupMaintenance))
  }
  // 兜底：万一窗口一直没加载完（比如渲染进程异常），3 秒后照做，
  // 否则这台机器就再也不会自动备份了
  setTimeout(runStartupMaintenance, 3000)
}

/* ---------- 启动 ---------- */

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      win.show()
      win.focus()
      win.webContents.send('window:focus-input')
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.kin2123.thoughtvault')
    cfg = config.load()
    if (!cfg.hotkey) cfg.hotkey = config.DEFAULTS.hotkey

    if (cfg.dataDir) {
      try {
        paths.setBase(cfg.dataDir)
      } catch (err) {
        logLine('自定义数据目录无效，回退默认: ' + err.message)
        paths.setBase(null)
      }
    }

    try {
      db.open()
      const mig = db.migrateFromJson()
      if (mig.migrated) logLine(`已从 notes.json 迁移 ${mig.migrated} 条笔记`)
      const purged = db.purgeExpired()
      if (purged) logLine(`回收站自动清理 ${purged} 条`)
    } catch (err) {
      logLine('数据库初始化失败: ' + (err && err.stack ? err.stack : err))
    }

    registerIpc()
    registerAssetProtocol()
    createWindow()
    createTray()

    const res = registerHotkey(cfg.hotkey)
    if (!res.ok) logLine('快捷键注册失败: ' + cfg.hotkey)

    scheduleStartupMaintenance()

    applyLaunchAtLogin(cfg.launchAtLogin)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

process.on('uncaughtException', (err) => {
  logLine('uncaughtException: ' + (err && err.stack ? err.stack : String(err)))
})

app.on('before-quit', () => {
  quitting = true
  rememberBounds()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  db.close()
})

app.on('window-all-closed', () => {
  // 托盘常驻，不退出
})
