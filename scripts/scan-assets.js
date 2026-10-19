// 图片孤儿扫描（只读）：列出 assets/ 里没有被任何笔记引用的文件
//
//   npm run scan:assets            # 用配置里的数据目录（读不到就用 userData）
//   npm run scan:assets -- --dir=D:/我的思库
//
// 这个脚本**不会删除任何文件**。要不要清理由你来决定。
const { app } = require('electron')
const path = require('path')
const fs = require('fs')

const { extractRefs, findOrphans } = require('../electron/assets-scan')

function argDir() {
  const hit = process.argv.find((a) => a.startsWith('--dir='))
  return hit ? hit.slice('--dir='.length) : null
}

function resolveDataDir() {
  const fromArg = argDir()
  if (fromArg) return path.resolve(fromArg)
  // config.json 永远在 userData 里，它只是指向真正的数据目录
  const userData = app.getPath('userData')
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf-8'))
    if (cfg && cfg.dataDir) return cfg.dataDir
  } catch (_) {}
  return userData
}

function human(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(2) + ' MB'
}

let finished = false
function finish(code) {
  if (finished) return
  finished = true
  app.exit(code)
}
process.on('uncaughtException', (e) => {
  console.error('扫描中断: ' + (e && e.stack ? e.stack : e))
  finish(1)
})

app.whenReady().then(() => {
  const dir = resolveDataDir()
  const dbFile = path.join(dir, 'notes.db')
  const assetsDir = path.join(dir, 'assets')

  console.log('数据目录: ' + dir)

  if (!fs.existsSync(dbFile)) {
    console.error('找不到 notes.db，请用 --dir= 指定数据目录')
    return finish(1)
  }
  if (!fs.existsSync(assetsDir)) {
    console.log('没有 assets 目录，无需扫描。')
    return finish(0)
  }

  const Database = require('better-sqlite3')
  const db = new Database(dbFile, { readonly: true, fileMustExist: true })

  // 回收站里的笔记也算引用：它还能恢复
  const refs = new Set()
  let notes = 0
  for (const row of db.prepare('SELECT content FROM notes').iterate()) {
    extractRefs(row.content, refs)
    notes++
  }
  db.close()

  const files = fs.readdirSync(assetsDir)
  const { orphans, referenced } = findOrphans(files, refs)

  let orphanBytes = 0
  const rows = []
  for (const f of orphans) {
    let size = 0
    try {
      size = fs.statSync(path.join(assetsDir, f)).size
    } catch (_) {}
    orphanBytes += size
    rows.push({ f, size })
  }
  rows.sort((a, b) => b.size - a.size)

  let allBytes = 0
  for (const f of files) {
    try {
      allBytes += fs.statSync(path.join(assetsDir, f)).size
    } catch (_) {}
  }

  console.log(`笔记 ${notes} 条，引用了 ${refs.size} 个文件名`)
  console.log(`assets 文件 ${files.length} 个（${human(allBytes)}），其中被引用 ${referenced.length} 个`)
  console.log(`未引用 ${orphans.length} 个，合计 ${human(orphanBytes)}`)

  if (rows.length) {
    console.log('\n最大的 20 个未引用文件：')
    console.log('  大小'.padEnd(12) + '文件名')
    for (const r of rows.slice(0, 20)) {
      console.log('  ' + human(r.size).padStart(10) + '  ' + r.f)
    }
    console.log('\n引用未命中情况：如果这个数字异常大，先确认笔记里的图片链接没被改坏。')
  }

  console.log('\n本脚本只读，没有删除任何文件。')
  finish(0)
})
