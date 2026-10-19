const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const DEFAULTS = {
  version: 1,
  hotkey: 'CommandOrControl+Shift+Space',
  hideOnBlur: true,
  launchAtLogin: false,
  theme: 'system',
  fontSize: 'm',
  accent: 'violet',
  density: 'cozy',
  markdown: true,
  sort: 'updated',
  onboarded: false,
  dataDir: null,
  window: { x: null, y: null, width: 780, height: 600 },
  lastBackupAt: 0
}

function configFile() {
  return path.join(app.getPath('userData'), 'config.json')
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(configFile(), 'utf-8'))
    return {
      ...DEFAULTS,
      ...raw,
      window: { ...DEFAULTS.window, ...(raw.window || {}) }
    }
  } catch (_) {
    return { ...DEFAULTS, window: { ...DEFAULTS.window } }
  }
}

function save(cfg) {
  const file = configFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf-8')
  fs.renameSync(tmp, file)
  return true
}

module.exports = { DEFAULTS, load, save, configFile }
