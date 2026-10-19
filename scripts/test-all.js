// 统一测试入口：顺序跑完所有脚本，汇总结果。
//
// 为什么不用 `a && b && c`：脚本各自 print 完「合计 N 项，通过 N，失败 N」就 app.quit()，
// 失败时退出码仍是 0，串起来跑会漏判。所以这里既看退出码，也数 stdout 里的 FAIL 行。
//
// 用法：
//   node scripts/test-all.js              全部（含需要真实渲染的 5 个）
//   node scripts/test-all.js --data-only  只跑数据层（可在无头环境 / CI 里跑）
const { spawnSync } = require('child_process')
const path = require('path')

const electron = require('electron')

const DATA_TESTS = ['test-db', 'test-datadir', 'test-nav', 'test-consistency', 'test-logger', 'test-assets-scan', 'test-logic', 'test-recovery', 'test-ipc-guard', 'test-maintenance']
// 这 5 个要从 dist 加载页面，沙箱/CI 里没有真实渲染环境会失败
const UI_TESTS = ['test-groups', 'test-paging', 'test-batch', 'test-edge', 'test-edge2']

const dataOnly = process.argv.includes('--data-only')
const list = dataOnly ? DATA_TESTS : DATA_TESTS.concat(UI_TESTS)

// 这两个环境变量会让 Electron 以 Node 模式启动，脚本里 require('electron') 就拿不到 app
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.NODE_OPTIONS

const failed = []
const rows = []

for (const name of list) {
  process.stdout.write(`\n=== ${name} ===\n`)
  const r = spawnSync(electron, [path.join(__dirname, name + '.js')], {
    encoding: 'utf8',
    env,
    timeout: 180000,
    windowsHide: true
  })

  const out = r.stdout || ''
  const err = r.stderr || ''
  process.stdout.write(out)
  if (err.trim()) process.stderr.write(err)

  // 脚本自己会打「通过 N，失败 N」，但退出码不可靠，所以再数一遍 FAIL 行
  const failLines = (out.match(/^FAIL\b/gm) || []).length
  const total = (out.match(/合计 (\d+) 项/) || [])[1]
  const ok = r.status === 0 && failLines === 0 && !r.error

  rows.push({ name, total: total || '-', failLines, ok, signal: r.signal })
  if (!ok) failed.push(name)
}

process.stdout.write('\n' + '-'.repeat(52) + '\n')
for (const r of rows) {
  process.stdout.write(
    `${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(16)} 断言 ${String(r.total).padStart(3)}  FAIL ${r.failLines}\n`
  )
}
process.stdout.write('-'.repeat(52) + '\n')
process.stdout.write(`${rows.length - failed.length}/${rows.length} 个脚本通过\n`)

if (failed.length) {
  process.stdout.write('失败: ' + failed.join(', ') + '\n')
  process.exit(1)
}
