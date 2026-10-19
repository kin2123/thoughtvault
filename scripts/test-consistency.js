// 一致性自检：防止「同一套规则写在两处」慢慢漂移。
// 纯文本比对，不需要渲染环境，可在 CI 里跑。
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

let pass = 0
let fail = 0
function check(name, ok, extra) {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

const dbSrc = read('electron/db.js')
const apiSrc = read('src/api.js')
const textSrc = read('src/lib/text.mjs')

/* 1. 标签正则：main 解析、浏览器兜底解析、渲染层剥离，三处必须是同一套字符集 */
const TAG_RE_LITERAL = /const TAG_RE = (\/.*\/[a-z]*)/

const dbTag = (dbSrc.match(TAG_RE_LITERAL) || [])[1]
const apiTag = (apiSrc.match(TAG_RE_LITERAL) || [])[1]
const textTag = (textSrc.match(TAG_RE_LITERAL) || [])[1]

check('三处都定义了 TAG_RE', Boolean(dbTag && apiTag && textTag), `${dbTag} | ${apiTag} | ${textTag}`)
check('electron/db.js 与 src/api.js 的标签正则一致', dbTag === apiTag, `${dbTag} vs ${apiTag}`)
check('展示层剥标签用的是同一套字符集', dbTag === textTag, `${dbTag} vs ${textTag}`)

/* 2. 版本号只允许由 package.json / 主进程提供，渲染层不能写死 */
const hardcoded = /appVersion:\s*'\d+\.\d+\.\d+'/
check('src/ 里没有写死的版本号', !hardcoded.test(apiSrc) && !hardcoded.test(textSrc) && !hardcoded.test(read('src/App.vue')))

/* 3. 标签字符合集：main 校验、浏览器兜底校验，两处必须一致 */
const NAME_RE_LITERAL = /const TAG_NAME_RE = (\/.*\/[a-z]*)/

const dbName = (dbSrc.match(NAME_RE_LITERAL) || [])[1]
const apiName = (apiSrc.match(NAME_RE_LITERAL) || [])[1]
check('主进程与兜底实现都校验标签名', Boolean(dbName && apiName), `${dbName} | ${apiName}`)
check('两处标签名校验规则一致', dbName === apiName, `${dbName} vs ${apiName}`)

console.log(`\n合计 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
process.exit(fail ? 1 : 0)
