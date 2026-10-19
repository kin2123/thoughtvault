// 周期维护判定自检：纯逻辑
const { needsBackup, DEFAULT_BACKUP_AGE } = require('../electron/maintenance')

let pass = 0
let fail = 0
function check(name, ok, extra) {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

const t0 = 2000000000000 // 固定基准，不依赖当前时间
const HOUR = 60 * 60 * 1000

check('默认阈值是 24 小时', DEFAULT_BACKUP_AGE === 24 * HOUR, String(DEFAULT_BACKUP_AGE))
check('从没备份过要备', needsBackup(0, t0) === true)
check('1 小时前刚备过，不备', needsBackup(t0 - HOUR, t0) === false)
check('23 小时前，不备', needsBackup(t0 - 23 * HOUR, t0) === false)
check('刚好 24 小时，备', needsBackup(t0 - 24 * HOUR, t0) === true)
check('25 小时前，备', needsBackup(t0 - 25 * HOUR, t0) === true)
check('时间戳在未来（时钟回拨）不乱备', needsBackup(t0 + HOUR, t0) === false)
check('字符串时间戳也能处理', needsBackup(String(t0 - 25 * HOUR), t0) === true)
check('自定义阈值生效', needsBackup(t0 - 2 * HOUR, t0, HOUR) === true)
check('null / undefined 视为没备份过', needsBackup(null, t0) === true && needsBackup(undefined, t0) === true)

console.log(`\n合计 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
process.exit(fail ? 1 : 0)
