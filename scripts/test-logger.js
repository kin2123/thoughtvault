// 日志模块自检：轮转行为，不需要渲染环境
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createLogger, MAX_BYTES } = require('../electron/logger')

const dir = path.join(os.tmpdir(), 'tv-log-' + Date.now())
fs.mkdirSync(dir, { recursive: true })

let pass = 0
let fail = 0
function check(name, ok, extra) {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

const log = createLogger(() => dir)
check('默认上限是 2MB', MAX_BYTES === 2 * 1024 * 1024, String(MAX_BYTES))

check('写入返回 true', log.logLine('第一条') === true)
const content = fs.readFileSync(path.join(dir, 'app.log'), 'utf-8')
check('日志带时间戳前缀', /^\[\d{4}-\d{2}-\d{2}T/.test(content), content.trim())

/* 用小上限验证轮转：写满一轮后，当前文件应该变小、旧文件出现 */
try {
  fs.unlinkSync(path.join(dir, 'app.log'))
} catch (_) {}

const small = createLogger(() => dir, { maxBytes: 200 })
small.logLine('FIRST-MARKER ' + 'x'.repeat(50))
small.logLine('y'.repeat(60))
small.logLine('z'.repeat(60))
small.logLine('w'.repeat(60)) // 这次写入前会先轮转

const rotated = fs.existsSync(path.join(dir, 'app.log.1'))
check('超过上限后生成 app.log.1', rotated)
check(
  '轮转后当前文件不超过上限',
  fs.statSync(path.join(dir, 'app.log')).size <= 200 + 80,
  String(fs.statSync(path.join(dir, 'app.log')).size)
)
check('旧文件保留了之前的内容', rotated && fs.readFileSync(path.join(dir, 'app.log.1'), 'utf-8').includes('FIRST-MARKER'))
check('只保留一份旧日志', !fs.existsSync(path.join(dir, 'app.log.2')))

/* 目录不可写时不能抛 */
const broken = createLogger(() => path.join(dir, 'nope', '\u0000bad'), { maxBytes: 10 })
check('写日志失败不抛异常', broken.logLine('x') === false)

// 二次轮转：旧文件应被覆盖而不是叠加
small.logLine('v'.repeat(300))
small.logLine('u'.repeat(10)) // 这次写入前触发第二次轮转
const firstOld = fs.readFileSync(path.join(dir, 'app.log.1'), 'utf-8')
check('第二次轮转覆盖旧文件', !firstOld.includes('FIRST-MARKER'), String(firstOld.length))

console.log(`\n合计 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
try {
  fs.rmSync(dir, { recursive: true, force: true })
} catch (_) {}
process.exit(fail ? 1 : 0)
