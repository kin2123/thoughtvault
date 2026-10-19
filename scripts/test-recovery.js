// 崩溃重载闸门自检：纯逻辑，不需要渲染环境
const { createReloadGate } = require('../electron/recovery')

let pass = 0
let fail = 0
function check(name, ok, extra) {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

const t0 = 1000000

/* 默认：60 秒内最多两次 */
const gate = createReloadGate()
check('第一次崩溃允许重载', gate(t0) === true)
check('第二次仍然允许', gate(t0 + 1000) === true)
check('第三次被拦下', gate(t0 + 2000) === false)

/* 时间窗口滑过之后恢复 */
check('窗口内仍然拦截', gate(t0 + 59000) === false)
check('超出 60 秒后重新允许', gate(t0 + 61000) === true)

/* 自定义参数 */
const strict = createReloadGate({ windowMs: 1000, maxReloads: 1 })
check('自定义只允许一次', strict(t0) === true && strict(t0 + 10) === false)
check('自定义窗口到期后可再来一次', strict(t0 + 1100) === true)

/* 多次崩溃后不会无限累积 */
const long = createReloadGate({ windowMs: 10000, maxReloads: 3 })
const results = [0, 1, 2, 3, 4].map((i) => long(t0 + i))
check('按上限截断', results.join(',') === 'true,true,true,false,false', results.join(','))

console.log(`\n合计 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
process.exit(fail ? 1 : 0)
