/**
 * 周期维护的判定逻辑。
 *
 * 背景：关窗口只是 hide，托盘常驻的用户可能几天不重启。
 * 原来备份和回收站清理都只在启动时跑一次，等于长期不生效。
 * 这里只放「该不该备份」这种纯判断，方便脱离 Electron 测。
 */
const HOUR = 60 * 60 * 1000
const DEFAULT_BACKUP_AGE = 24 * HOUR

/**
 * 距上次备份超过 maxAge 就返回 true；从没备份过也算。
 * 系统时间被往回拨（now < last）时返回 false，避免连着备份。
 */
function needsBackup(lastAt, now = Date.now(), maxAge = DEFAULT_BACKUP_AGE) {
  const last = Number(lastAt) || 0
  if (!last) return true
  const gap = now - last
  if (gap < 0) return false
  return gap >= maxAge
}

module.exports = { needsBackup, DEFAULT_BACKUP_AGE }
