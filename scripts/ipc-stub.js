// 测试用的 IPC 桩：把真实 db / store / config 挂到所有 channel 上，
// 各测试脚本共用一份，避免新增 channel 时到处漏改。
const { app, ipcMain } = require('electron')
const path = require('path')

function install({ db, store, config, tmp, opts = {} }) {
  const base = () => ({
    ...config.load(),
    hotkeyActive: 'CommandOrControl+Shift+Space',
    appVersion: app.getVersion(),
    dataDir: tmp,
    backupsDir: path.join(tmp, 'backups'),
    isPackaged: false,
    onboarded: true,
    theme: 'dark',
    fontSize: 'm',
    markdown: true,
    sort: 'updated',
    ...(opts.config || {})
  })

  const on = (channel, fn) => ipcMain.handle(channel, fn)

  /* 笔记 */
  on('notes:bootstrap', (_e, o) => db.bootstrap(o || {}))
  on('notes:list', (_e, o) => db.listNotes(o || {}))
  on('notes:trash', () => db.listTrash())
  on('notes:tags', () => db.listTags())
  on('notes:stats', () => db.getStats())
  on('notes:create', (_e, p) => db.createNote(p))
  on('notes:update', (_e, id, p) => db.updateNote(id, p))
  on('notes:pin', (_e, id, v) => db.setPinned(id, v))
  on('notes:delete', (_e, id) => db.softDelete(id))
  on('notes:restore', (_e, id) => db.restore(id))
  on('notes:purge', (_e, id) => db.purge(id))
  on('notes:emptyTrash', () => db.emptyTrash())
  on('notes:exportAll', () => db.exportAll())
  on('notes:batchDelete', (_e, ids) => db.batchSoftDelete(ids))
  on('notes:renameTag', (_e, f, t) => db.renameTag(f, t))
  on('notes:deleteTag', (_e, n) => db.deleteTag(n))
  on('notes:addTags', (_e, ids, t) => db.addTags(ids, t))

  /* 图片 */
  on('asset:save', (_e, p) => {
    const assets = require('../electron/assets')
    return assets.save(path.join(tmp, 'assets'), Buffer.from(p.buffer), p.ext)
  })

  /* 草稿 */
  on('draft:load', () => store.loadDraft())
  on('draft:save', (_e, t) => store.saveDraft(t))
  on('draft:clear', () => store.clearDraft())

  /* 配置 */
  on('config:get', () => base())
  // 和主进程一样落盘，否则「设置是否持久化」这类断言测不出来
  on('config:set', (_e, p) => {
    const next = { ...config.load(), ...p }
    config.save(next)
    return { ...base(), ...p }
  })
  on('hotkey:set', () => ({ ok: true }))
  on('hotkey:reset', () => ({ ok: true }))

  /* 备份与导入导出 */
  on('backup:now', () => db.backupTo(path.join(tmp, 'backups')))
  on('backup:list', () => store.listBackups())
  on('export:file', () => ({ ok: true, path: '（测试）' }))
  on('import:json', () => ({ ok: false, canceled: true }))
  on('app:openDir', () => '')

  /* 窗口 */
  ipcMain.on('window:hide', () => {})
  ipcMain.on('window:show', () => {})

  return { base }
}

/** 覆盖某个 channel 的行为（个别测试需要） */
function override(channel, fn) {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, fn)
}

module.exports = { install, override }
