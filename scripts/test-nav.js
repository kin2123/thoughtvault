// 导航边界自检：纯逻辑，不需要渲染环境，可在 CI 里跑
const path = require('path')

const { isInternal, externalUrl } = require('../electron/nav')

const APP_DIR = path.join(__dirname, '..', 'dist')

let pass = 0
let fail = 0
function check(name, ok, extra) {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

const opts = { devUrl: 'http://localhost:5173', appDir: APP_DIR }
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/')

/* 内部页面 */
check('打包后的 dist/index.html 算内部', isInternal(fileUrl(path.join(APP_DIR, 'index.html')), opts))
check('dist 子目录也算内部', isInternal(fileUrl(path.join(APP_DIR, 'assets', 'a.png')), opts))
check('大小写不同的盘符与路径仍算内部',
  isInternal(fileUrl(path.join(APP_DIR, 'index.html')).toUpperCase(), opts))

/* 外部 */
check('外站不算内部', !isInternal('https://example.com/', opts))
check('本地 HTTP 不算内部（非 dev server 端口）', !isInternal('http://localhost:8080/', opts))
check('指向其他目录的 file:// 不算内部', !isInternal(fileUrl('C:/Windows/System32/drivers/etc/hosts'), opts))
check('dist 的兄弟目录不算内部（前缀不能误判）',
  !isInternal(fileUrl(APP_DIR + '-backup/index.html'), opts))
check('空 URL 不算内部', !isInternal('', opts))

/* 开发服务器 */
check('dev server 页面算内部', isInternal('http://localhost:5173/', opts))
check('dev server 子路径算内部', isInternal('http://localhost:5173/index.html?x=1', opts))
check('没有 devUrl 时本机 HTTP 不算内部', !isInternal('http://localhost:5173/', { appDir: APP_DIR }))
check('devUrl 带尾斜杠也能匹配', isInternal('http://localhost:5173/a', { devUrl: 'http://localhost:5173/' }))

/* 交给系统浏览器之前的协议白名单 */
check('https 允许外开', externalUrl('https://example.com/a?b=1') !== null)
check('http 允许外开', externalUrl('http://example.com/') !== null)
check('mailto 允许外开', externalUrl('mailto:someone@example.com') !== null)
check('javascript: 被丢弃', externalUrl('javascript:require("child_process")') === null)
check('data: 被丢弃', externalUrl('data:text/html,<script>alert(1)</script>') === null)
check('file: 被丢弃', externalUrl('file:///C:/Windows/System32/calc.exe') === null)
check('畸形 URL 被丢弃', externalUrl('not a url') === null)
check('空值被丢弃', externalUrl(null) === null)

console.log(`\n合计 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
process.exit(fail ? 1 : 0)
