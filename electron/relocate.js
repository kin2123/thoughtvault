const fs = require('fs')
const path = require('path')

/**
 * 数据目录搬迁。
 * 依赖注入，方便脱离 Electron 环境测试。
 *
 * @param {object} opts
 * @param {object} opts.db      数据库模块（需要 close / open / integrityCheck）
 * @param {object} opts.paths   路径模块（getBase / setBase）
 * @param {function} opts.saveConfig  (cfg) => void，持久化配置
 * @param {function} opts.askAttach   async () => boolean，目标已有数据时询问
 * @param {function} opts.log         (msg) => void
 */
function createRelocator({ db, paths, saveConfig, askAttach, log = () => {} }) {
  function copyDataTo(target) {
    const src = paths.getBase()
    const files = ['notes.db', 'notes.db-wal', 'notes.db-shm', 'draft.json']
    const dirs = ['assets', 'backups']

    for (const name of files) {
      const from = path.join(src, name)
      const to = path.join(target, name)
      if (!fs.existsSync(from) || fs.existsSync(to)) continue
      fs.copyFileSync(from, to)
    }
    for (const name of dirs) {
      const from = path.join(src, name)
      const to = path.join(target, name)
      if (!fs.existsSync(from)) continue
      fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false })
    }
  }

  async function relocate(rawTarget, cfg) {
    const target = path.resolve(rawTarget)
    const current = paths.getBase()
    if (target === current) return { ok: true, mode: 'same', path: target }

    // 可写性检查：建目录 + 写探针
    try {
      fs.mkdirSync(target, { recursive: true })
      const probe = path.join(target, '.tv-write-probe')
      fs.writeFileSync(probe, 'ok')
      fs.unlinkSync(probe)
    } catch (err) {
      return { ok: false, error: '这个目录不可写：' + err.message }
    }

    const targetHasDb = fs.existsSync(path.join(target, 'notes.db'))
    if (targetHasDb && askAttach) {
      const agreed = await askAttach(target)
      if (!agreed) return { ok: false, canceled: true }
    }

    // 先关库，避免边写边拷
    db.close()

    let copied = false
    if (!targetHasDb) {
      try {
        copyDataTo(target)
        copied = true
      } catch (err) {
        try {
          db.open()
        } catch (_) {}
        return { ok: false, error: '复制数据失败：' + err.message }
      }
    }

    const previous = paths.isCustom() ? paths.getBase() : null
    paths.setBase(target)
    try {
      db.open()
      const check = db.integrityCheck()
      if (check !== 'ok') throw new Error('完整性检查未通过 (' + check + ')')
    } catch (err) {
      // 回滚，保证原来的数据还能用
      paths.setBase(previous)
      try {
        db.open()
      } catch (_) {}
      return { ok: false, error: '新位置打不开数据库，已回滚：' + err.message }
    }

    cfg.dataDir = target
    saveConfig(cfg)
    log(`数据目录切换 ${current} → ${target}` + (copied ? '（已复制现有数据）' : '（使用目标已有数据）'))

    return {
      ok: true,
      mode: copied ? 'copied' : 'attached',
      path: target,
      previous,
      remainsAtPrevious: true
    }
  }

  return { relocate, copyDataTo }
}

module.exports = { createRelocator }
