const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('vault', {
  /* 笔记 */
  bootstrap: (opts) => ipcRenderer.invoke('notes:bootstrap', opts),
  list: (opts) => ipcRenderer.invoke('notes:list', opts),
  trash: () => ipcRenderer.invoke('notes:trash'),
  tags: () => ipcRenderer.invoke('notes:tags'),
  stats: () => ipcRenderer.invoke('notes:stats'),
  create: (payload) => ipcRenderer.invoke('notes:create', payload),
  update: (id, payload) => ipcRenderer.invoke('notes:update', id, payload),
  pin: (id, pinned) => ipcRenderer.invoke('notes:pin', id, pinned),
  remove: (id) => ipcRenderer.invoke('notes:delete', id),
  restore: (id) => ipcRenderer.invoke('notes:restore', id),
  purge: (id) => ipcRenderer.invoke('notes:purge', id),
  emptyTrash: () => ipcRenderer.invoke('notes:emptyTrash'),
  exportAll: () => ipcRenderer.invoke('notes:exportAll'),
  batchDelete: (ids) => ipcRenderer.invoke('notes:batchDelete', ids),
  renameTag: (from, to) => ipcRenderer.invoke('notes:renameTag', from, to),
  deleteTag: (name) => ipcRenderer.invoke('notes:deleteTag', name),
  addTags: (ids, tags) => ipcRenderer.invoke('notes:addTags', ids, tags),

  /* 图片 */
  saveAsset: (payload) => ipcRenderer.invoke('asset:save', payload),
  scanAssets: () => ipcRenderer.invoke('assets:scan'),

  /* 草稿 */
  loadDraft: () => ipcRenderer.invoke('draft:load'),
  saveDraft: (text) => ipcRenderer.invoke('draft:save', text),
  clearDraft: () => ipcRenderer.invoke('draft:clear'),

  /* 配置 */
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  setHotkey: (accel) => ipcRenderer.invoke('hotkey:set', accel),
  resetHotkey: () => ipcRenderer.invoke('hotkey:reset'),

  /* 备份与导入导出 */
  backupNow: () => ipcRenderer.invoke('backup:now'),
  backupList: () => ipcRenderer.invoke('backup:list'),
  restoreBackup: (name) => ipcRenderer.invoke('backup:restore', name),
  exportFile: (payload) => ipcRenderer.invoke('export:file', payload),
  importJson: () => ipcRenderer.invoke('import:json'),
  openDir: (which) => ipcRenderer.invoke('app:openDir', which),

  /* 数据目录 */
  pickDataDir: () => ipcRenderer.invoke('data:pick'),
  relocateDataDir: (target) => ipcRenderer.invoke('data:relocate', target),
  resetDataDir: () => ipcRenderer.invoke('data:reset'),

  /* 窗口 */
  hide: () => ipcRenderer.send('window:hide'),
  show: () => ipcRenderer.send('window:show'),
  // 返回取消订阅函数，避免重复注册导致监听器堆积
  onFocusInput: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('window:focus-input', handler)
    return () => ipcRenderer.removeListener('window:focus-input', handler)
  },
  onOpenPanel: (cb) => {
    const handler = (_e, panel) => cb(panel)
    ipcRenderer.on('ui:open', handler)
    return () => ipcRenderer.removeListener('ui:open', handler)
  },

  platform: process.platform
})
