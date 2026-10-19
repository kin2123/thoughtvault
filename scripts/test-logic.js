// 展示逻辑自检：跑 src/lib/text.js（ESM），不需要真实窗口
const { app } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')

let pass = 0
let fail = 0
function check(name, ok, extra) {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

process.on('uncaughtException', (e) => {
  console.log('FAIL 未捕获异常  ' + (e && e.message))
  app.exit(1)
})

app.whenReady().then(async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'lib', 'text.mjs')).toString())
  const { stripTags, fmtTime, dayLabel, buildGroups } = mod
  const prefs = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'lib', 'prefs.mjs')).toString())
  const hl = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'lib', 'highlight.mjs')).toString())

  const now = new Date(2026, 9, 19, 12, 0, 0).getTime()
  const at = (y, m, d, hh = 9, mm = 5) => new Date(y, m - 1, d, hh, mm).getTime()

  /* 剥标签 */
  check('去掉正文里的 #标签', stripTags('今天学习 #开发 的笔记') === '今天学习  的笔记', stripTags('今天学习 #开发 的笔记'))
  check('多个标签都去掉', !stripTags('#a 内容 #b/c-d_e').includes('#'))
  check('空值不报错', stripTags(null) === '' && stripTags(undefined) === '')

  /* 列表时间 */
  check('今天显示 今天 HH:MM', fmtTime(now, now) === '今天 12:00', fmtTime(now, now))
  check('昨天显示 昨天 HH:MM', fmtTime(at(2026, 10, 18), now) === '昨天 09:05', fmtTime(at(2026, 10, 18), now))
  check('今年其他日子显示 MM-DD', fmtTime(at(2026, 10, 17), now) === '10-17 09:05', fmtTime(at(2026, 10, 17), now))
  check('往年显示完整日期', fmtTime(at(2025, 10, 17), now) === '2025-10-17', fmtTime(at(2025, 10, 17), now))

  /* 分组标题 */
  check('今天', dayLabel(now, now) === '今天', dayLabel(now, now))
  check('昨天', dayLabel(at(2026, 10, 18), now) === '昨天', dayLabel(at(2026, 10, 18), now))
  check('今年内带星期', dayLabel(at(2026, 10, 17), now) === '10月17日 周六', dayLabel(at(2026, 10, 17), now))
  check('往年只写年月日', dayLabel(at(2025, 10, 17), now) === '2025年10月17日', dayLabel(at(2025, 10, 17), now))

  /* 分组 */
  const items = [
    { id: 'a', updatedAt: now, createdAt: at(2026, 10, 19) },
    { id: 'b', updatedAt: at(2026, 10, 19, 8, 0), createdAt: at(2026, 10, 19, 8, 0) },
    { id: 'c', updatedAt: at(2026, 10, 18), createdAt: at(2026, 10, 10) }
  ]
  const g = buildGroups(items, { sort: 'updated', now })
  check('按天切成 2 组', g.length === 2, String(g.length))
  check('组标题正确', g[0].label === '今天' && g[1].label === '昨天', g.map((x) => x.label).join(','))
  check('组内保持原顺序', g[0].items.map((n) => n.id).join(',') === 'a,b', g[0].items.map((n) => n.id).join(','))

  const byCreated = buildGroups(items, { sort: 'created', now })
  check(
    '按创建时间分组时看 createdAt',
    byCreated.length === 2 && byCreated[1].key === '2026-10-10' && byCreated[1].label === '10月10日 周六',
    byCreated.map((x) => x.key + '/' + x.label).join(',')
  )

  const byLength = buildGroups(items, { sort: 'length', now })
  check('按篇幅排序不分组', byLength.length === 1 && byLength[0].label === null && byLength[0].key === '_all')
  check('空列表返回空数组', buildGroups([], { now }).length === 0)

  /* 搜索高亮切分 */
  const seg = (t, q) => hl.splitByQuery(t, q).map((p) => (p.hit ? '[' + p.text + ']' : p.text)).join('')
  check('无关键词时原样返回', seg('今天学习', '') === '今天学习')
  check('单词命中被切出来', seg('今天学习 SQLite', '学习') === '今天[学习] SQLite', seg('今天学习 SQLite', '学习'))
  check('大小写不敏感', seg('学习 SQLite', 'sqlite') === '学习 [SQLite]', seg('学习 SQLite', 'sqlite'))
  check('多次命中都高亮', seg('a-b-a', 'a') === '[a]-b-[a]', seg('a-b-a', 'a'))
  check('多词分别高亮', seg('学习 sqlite 索引', '学习 索引') === '[学习] sqlite [索引]', seg('学习 sqlite 索引', '学习 索引'))
  check('长词优先，不被短词拆开', seg('学习', '学 学习') === '[学习]', seg('学习', '学 学习'))
  check('正则元字符按字面处理', seg('a.b', '.') === 'a[.]b', seg('a.b', '.'))
  check('查不到时原样返回', seg('abc', 'zzz') === 'abc')

  /* 外观偏好：非法值必须回落，否则 dataset 上会挂个不存在的名字 */
  check('强调色: 合法值保留', prefs.normalizeAccent('teal') === 'teal')
  check('强调色: 非法值回落 violet', prefs.normalizeAccent('rainbow') === 'violet')
  check('强调色: 空值回落 violet', prefs.normalizeAccent(undefined) === 'violet')
  check('密度: 合法值保留', prefs.normalizeDensity('compact') === 'compact')
  check('密度: 空串回落 cozy', prefs.normalizeDensity('') === 'cozy')
  check('预设数量: 4 种强调色 / 2 种密度', prefs.ACCENTS.length === 4 && prefs.DENSITIES.length === 2)

  console.log(`\n合计 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
  app.exit(fail ? 1 : 0)
})
