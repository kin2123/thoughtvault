const fs = require('fs')
const path = require('path')
const paths = require('./paths')

const BACKUP_KEEP = 7
const BACKUP_PATTERN = /^notes-\d{8}-\d{6}\.db$/

function userDir() {
  return paths.getBase()
}

function draftFile() {
  return paths.draft()
}

function backupsDir() {
  return paths.backups()
}

function assetsDir() {
  return paths.assets()
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, content, 'utf-8')
  fs.renameSync(tmp, file)
}

function loadDraft() {
  try {
    const d = JSON.parse(fs.readFileSync(draftFile(), 'utf-8'))
    return typeof d.text === 'string' ? d.text : ''
  } catch (_) {
    return ''
  }
}

function saveDraft(text) {
  if (!text) return clearDraft()
  atomicWrite(draftFile(), JSON.stringify({ text, at: Date.now() }, null, 2))
  return true
}

function clearDraft() {
  try {
    fs.unlinkSync(draftFile())
  } catch (_) {}
  return true
}

function listBackups() {
  try {
    return fs
      .readdirSync(backupsDir())
      .filter((f) => BACKUP_PATTERN.test(f) || f.endsWith('.json'))
      .map((f) => {
        const full = path.join(backupsDir(), f)
        const st = fs.statSync(full)
        return { name: f, path: full, size: st.size, at: st.mtimeMs }
      })
      .sort((a, b) => b.at - a.at)
  } catch (_) {
    return []
  }
}

/** 只保留最近 N 份 .db 备份，旧的直接删掉 */
function pruneBackups(keep = BACKUP_KEEP) {
  const dbFiles = listBackups().filter((b) => b.name.endsWith('.db'))
  for (const b of dbFiles.slice(keep)) {
    try {
      fs.unlinkSync(b.path)
    } catch (_) {}
  }
  return dbFiles.slice(0, keep)
}

module.exports = {
  userDir,
  draftFile,
  backupsDir,
  assetsDir,
  loadDraft,
  saveDraft,
  clearDraft,
  listBackups,
  pruneBackups
}
