/**
 * 数据目录解析
 *
 * config.json 永远留在系统 userData 里（它是「指针」，不能跟着搬），
 * notes.db / assets / backups / logs / draft 都跟着这里返回的目录走。
 */
const { app } = require('electron')
const path = require('path')
const fs = require('fs')

let customBase = null

/** 用户自定义的数据目录；null 表示用系统默认 */
function setBase(dir) {
  if (!dir) {
    customBase = null
    return
  }
  const resolved = path.resolve(dir)
  // 指回默认目录时不算「自定义」，界面上才不会一直显示“恢复默认”按钮
  customBase = resolved === path.resolve(app.getPath('userData')) ? null : resolved
}

function getBase() {
  return customBase || app.getPath('userData')
}

function isCustom() {
  return Boolean(customBase)
}

/** 配置文件本身的位置，永远不变 */
function configDir() {
  return app.getPath('userData')
}

const join = (name) => path.join(getBase(), name)

module.exports = {
  setBase,
  getBase,
  isCustom,
  configDir,
  notesDb: () => join('notes.db'),
  draft: () => join('draft.json'),
  assets: () => join('assets'),
  backups: () => join('backups'),
  logs: () => join('logs'),
  ensure: () => fs.mkdirSync(getBase(), { recursive: true })
}
