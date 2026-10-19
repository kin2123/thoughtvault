/**
 * 极简文件日志：只负责「别无限长大」和「出事了能翻」。
 *
 * 之前 logLine 直接 appendFileSync，跑几年 app.log 能到几十 MB。
 * 超过上限就把它改名成 app.log.1（只保留一份旧文件），比引第三方库划算得多。
 */
const fs = require('fs')
const path = require('path')

const MAX_BYTES = 2 * 1024 * 1024

function createLogger(dirFn, { maxBytes = MAX_BYTES } = {}) {
  function file(dir = dirFn()) {
    return path.join(dir, 'app.log')
  }

  function rotate(dir) {
    const cur = file(dir)
    const old = cur + '.1'
    try {
      // Windows 上 rename 到已存在的文件会失败，先删旧的
      try {
        fs.unlinkSync(old)
      } catch (_) {}
      fs.renameSync(cur, old)
    } catch (_) {}
  }

  function logLine(msg) {
    try {
      const dir = dirFn()
      fs.mkdirSync(dir, { recursive: true })
      const cur = file(dir)
      let size = 0
      try {
        size = fs.statSync(cur).size
      } catch (_) {}
      if (size > maxBytes) rotate(dir)
      fs.appendFileSync(cur, `[${new Date().toISOString()}] ${msg}\n`, 'utf-8')
      return true
    } catch (_) {
      // 日志失败绝不能影响主流程
      return false
    }
  }

  return { logLine, file, maxBytes }
}

module.exports = { createLogger, MAX_BYTES }
