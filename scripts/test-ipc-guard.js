// IPC 入参收敛自检：纯逻辑
const guard = require('../electron/ipc-guard')

let pass = 0
let fail = 0
function check(name, ok, extra) {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

/* listOpts */
const d = guard.listOpts()
check('默认 limit 500', d.limit === 500, String(d.limit))
check('默认排序 updated', d.sort === 'updated')
check('默认统计标签', d.withTags === true)
check('默认空查询', d.query === '' && d.tag === '')

check('limit 1e9 被截到上限', guard.listOpts({ limit: 1e9 }).limit === guard.MAX_LIMIT, String(guard.listOpts({ limit: 1e9 }).limit))
check('负数 limit 回落到 500', guard.listOpts({ limit: -5 }).limit === 500)
check('字符串数字可用', guard.listOpts({ limit: '80' }).limit === 80)
check('NaN 回落到 500', guard.listOpts({ limit: 'abc' }).limit === 500)
check('小数取整', guard.listOpts({ limit: 12.9 }).limit === 12)

check('非法排序被忽略', guard.listOpts({ sort: 'DROP TABLE' }).sort === 'updated')
check('合法排序保留', guard.listOpts({ sort: 'length' }).sort === 'length')
check('超长查询被截断', guard.listOpts({ query: 'x'.repeat(500) }).query.length === 200)
check('超长标签被截断', guard.listOpts({ tag: 'y'.repeat(500) }).tag.length === 64)
check('withTags=false 保留', guard.listOpts({ withTags: false }).withTags === false)
check('withTags 非 false 视为 true', guard.listOpts({ withTags: 0 }).withTags === true)
check('非对象入参不报错', guard.listOpts('oops').limit === 500 && guard.listOpts(null).limit === 500)

/* idList */
check('非数组返回空', guard.idList('x').length === 0 && guard.idList(null).length === 0)
check('过滤非字符串与空串', guard.idList(['a', 1, '', null, 'b']).join(',') === 'a,b')
const manyIds = Array.from({ length: 6000 }, (_, i) => 'id' + i)
check('id 数量有上限', guard.idList(manyIds).length === guard.MAX_IDS, String(guard.idList(manyIds).length))

/* tagList */
check('去掉首尾空白与空项', guard.tagList([' 开发 ', '', '  ', '读书']).join(',') === '开发,读书')
check('过滤非字符串', guard.tagList([1, null, 'ok']).join(',') === 'ok')
const manyTags = Array.from({ length: 60 }, (_, i) => 't' + i)
check('标签数量有上限', guard.tagList(manyTags).length === guard.MAX_TAGS, String(guard.tagList(manyTags).length))

console.log(`\n合计 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
process.exit(fail ? 1 : 0)
