// 图片孤儿扫描的纯逻辑自检，不需要真实数据目录
const { extractRefs, findOrphans } = require('../electron/assets-scan')

let pass = 0
let fail = 0
function check(name, ok, extra) {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

/* 提取引用 */
const refs = extractRefs(
  '看 ![](tv-asset://abc123.png) 和 tv-asset://DEF456.JPG，再来一次 tv-asset://abc123.png'
)
check('提取到 2 个不同文件', refs.size === 2, [...refs].join(','))
check('统一转小写', refs.has('abc123.png') && refs.has('def456.jpg'), [...refs].join(','))
check('重复引用不重复计数', [...refs].filter((r) => r === 'abc123.png').length === 1)

check('忽略外链图片', extractRefs('![](https://x.com/a.png)').size === 0)
check('忽略非图片扩展名', extractRefs('tv-asset://abc.json').size === 0)
check('忽略路径穿越', extractRefs('tv-asset://../config.json').size === 0)
check('空内容不报错', extractRefs(null).size === 0 && extractRefs(undefined).size === 0)

/* 多个来源合并到同一个 Set */
const merged = extractRefs('a tv-asset://one.png', extractRefs('tv-asset://two.png'))
check('多次提取合并', merged.size === 2 && merged.has('one.png') && merged.has('two.png'))

/* 孤儿判定 */
const { orphans, referenced } = findOrphans(
  ['a.png', 'b.png', 'C.PNG'],
  new Set(['a.png', 'c.png'])
)
check('被引用的不算孤儿', referenced.length === 2 && referenced.includes('C.PNG'), referenced.join(','))
check('未引用的进入孤儿列表', orphans.length === 1 && orphans[0] === 'b.png', orphans.join(','))

const empty = findOrphans([], new Set())
check('空目录不报错', empty.orphans.length === 0 && empty.referenced.length === 0)

console.log(`\n合计 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
process.exit(fail ? 1 : 0)
