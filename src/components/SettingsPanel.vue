<template>
  <div class="mask" @mousedown.self="$emit('close')">
    <div class="panel">
      <header class="head">
        <span class="title">设置</span>
        <button class="x" title="关闭" @click="$emit('close')">✕</button>
      </header>

      <div class="body">
        <section>
          <h4>快捷键</h4>
          <div class="row">
            <div class="label">
              唤出 / 收起
              <span>在任何界面按下即可呼出</span>
            </div>
            <button class="keycap" :class="{ recording }" @click="startRecord">
              {{ recording ? '按下组合键…' : prettyHotkey(config.hotkeyActive || config.hotkey) }}
            </button>
          </div>
          <p v-if="hotkeyError" class="err">{{ hotkeyError }}</p>
          <p v-else-if="recording" class="tip">按 Esc 取消录音</p>
        </section>

        <section>
          <h4>行为</h4>
          <div class="row">
            <div class="label">
              失焦自动收起
              <span>点到别的窗口时自动隐藏</span>
            </div>
            <button
              class="switch"
              :class="{ on: config.hideOnBlur }"
              @click="$emit('update', { hideOnBlur: !config.hideOnBlur })"
            >
              <i></i>
            </button>
          </div>
          <div class="row">
            <div class="label">
              开机自动启动
              <span>{{ config.isPackaged ? '登录系统后静默启动' : '打包安装后才生效' }}</span>
            </div>
            <button
              class="switch"
              :class="{ on: config.launchAtLogin, disabled: !config.isPackaged }"
              @click="toggleLaunchAtLogin"
            >
              <i></i>
            </button>
          </div>
        </section>

        <section>
          <h4>外观</h4>
          <div class="row">
            <div class="label">
              主题
              <span>跟随系统会随 Windows 深浅色切换</span>
            </div>
            <div class="segs">
              <button
                v-for="t in themes"
                :key="t.value"
                :class="{ on: config.theme === t.value }"
                @click="$emit('update', { theme: t.value })"
              >
                {{ t.label }}
              </button>
            </div>
          </div>
          <div class="row">
            <div class="label">
              字号
              <span>影响正文与输入框</span>
            </div>
            <div class="segs">
              <button
                v-for="s in sizes"
                :key="s.value"
                :class="{ on: config.fontSize === s.value }"
                @click="$emit('update', { fontSize: s.value })"
              >
                {{ s.label }}
              </button>
            </div>
          </div>
          <div class="row">
            <div class="label">
              Markdown 渲染
              <span>关闭后只显示纯文本</span>
            </div>
            <button
              class="switch"
              :class="{ on: config.markdown }"
              @click="$emit('update', { markdown: !config.markdown })"
            >
              <i></i>
            </button>
          </div>
        </section>

        <section>
          <h4>标签</h4>
          <div class="row">
            <div class="label">
              管理标签
              <span>改名、合并、删除</span>
            </div>
            <button class="ghost" @click="$emit('manage-tags')">打开</button>
          </div>
        </section>

        <section>
          <h4>数据</h4>
          <div class="row">
            <div class="label">
              存储位置
              <span class="path" :title="config.dataDir">{{ config.dataDir }}</span>
            </div>
            <div class="btns">
              <button class="ghost" @click="$emit('open-dir', 'data')">打开</button>
              <button class="ghost" @click="$emit('change-data-dir')">更改…</button>
              <button v-if="config.isCustomDataDir" class="ghost" @click="$emit('reset-data-dir')">
                恢复默认
              </button>
            </div>
          </div>
          <p class="note">
            换位置会连笔记一起搬过去，原位置的数据保留不删。{{ config.isCustomDataDir ? '' : '（当前是默认位置）' }}
          </p>
          <div class="row">
            <div class="label">
              自动备份
              <span>{{ backupText }}</span>
            </div>
            <button class="ghost" @click="$emit('backup')">立即备份</button>
          </div>
          <div class="row">
            <div class="label">
              备份目录
              <span>最多保留最近 7 份</span>
            </div>
            <button class="ghost" @click="$emit('open-dir', 'backups')">打开</button>
          </div>
        </section>

        <section>
          <h4>导出 / 导入</h4>
          <div class="row">
            <div class="label">
              导出
              <span>共 {{ noteCount }} 条笔记</span>
            </div>
            <div class="btns">
              <button class="ghost" @click="$emit('export', 'md')">Markdown</button>
              <button class="ghost" @click="$emit('export', 'json')">JSON</button>
            </div>
          </div>
          <div class="row">
            <div class="label">
              导入
              <span>从 JSON 合并进来，重复的会自动跳过</span>
            </div>
            <button class="ghost" @click="$emit('import')">选择文件</button>
          </div>
        </section>

        <footer class="foot">
          <template v-if="config.appVersion">
            <span>思库 v{{ config.appVersion }}</span>
            <span class="sep">·</span>
          </template>
          <span>所有数据保存在本机，不联网</span>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { prettyHotkey, setHotkey } from '../api'

const props = defineProps({
  config: { type: Object, required: true },
  noteCount: { type: Number, default: 0 }
})

const emit = defineEmits([
  'close',
  'update',
  'backup',
  'export',
  'import',
  'open-dir',
  'toast',
  'manage-tags',
  'change-data-dir',
  'reset-data-dir'
])

const themes = [
  { value: 'dark', label: '深色' },
  { value: 'light', label: '浅色' },
  { value: 'system', label: '系统' }
]

const sizes = [
  { value: 's', label: '小' },
  { value: 'm', label: '中' },
  { value: 'l', label: '大' }
]

const recording = ref(false)
const hotkeyError = ref('')

const backupText = computed(() => {
  const at = props.config.lastBackupAt
  if (!at) return '还没有备份记录'
  const d = new Date(at)
  const pad = (n) => String(n).padStart(2, '0')
  return `上次备份：${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})

function toggleLaunchAtLogin() {
  if (!props.config.isPackaged) {
    emit('toast', { text: '开机自启需要打包安装后才生效' })
    return
  }
  emit('update', { launchAtLogin: !props.config.launchAtLogin })
}

function toAccel(e) {
  const mods = []
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')

  let key = null
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5)
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.code)) key = e.code
  else if (e.code === 'Space') key = 'Space'
  else if (e.code === 'Backquote') key = '`'
  else if (e.code === 'Minus') key = '-'
  else if (e.code === 'Equal') key = '='
  else if (e.code === 'BracketLeft') key = '['
  else if (e.code === 'BracketRight') key = ']'
  else if (e.code === 'Backslash') key = '\\'
  else if (e.code === 'Semicolon') key = ';'
  else if (e.code === 'Quote') key = "'"
  else if (e.code === 'Comma') key = ','
  else if (e.code === 'Period') key = '.'
  else if (e.code === 'Slash') key = '/'

  if (!key || !mods.length) return null
  return mods.concat(key).join('+')
}

async function onRecordKey(e) {
  e.preventDefault()
  e.stopPropagation()

  if (e.key === 'Escape') {
    stopRecord()
    return
  }
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

  const accel = toAccel(e)
  if (!accel) {
    hotkeyError.value = '至少需要一个 Ctrl / Alt / Shift 加一个普通键'
    return
  }
  stopRecord()
  const res = await setHotkey(accel)
  if (res && res.ok) {
    emit('update', { hotkeyActive: accel, hotkey: accel })
    emit('toast', { text: '快捷键已更新为 ' + prettyHotkey(accel) })
  } else {
    hotkeyError.value = (res && res.error) || '设置失败'
  }
}

function startRecord() {
  if (recording.value) return stopRecord()
  recording.value = true
  hotkeyError.value = ''
  window.addEventListener('keydown', onRecordKey, true)
}

function stopRecord() {
  recording.value = false
  window.removeEventListener('keydown', onRecordKey, true)
}

onBeforeUnmount(stopRecord)
</script>

<style scoped>
.mask {
  position: absolute;
  inset: 0;
  background: rgba(8, 8, 12, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.panel {
  width: min(560px, calc(100% - 40px));
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
}

.head {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 12px 0 18px;
  border-bottom: 1px solid var(--border-soft);
  flex: none;
}

.title {
  font-size: 13.5px;
  color: var(--text);
}

.x {
  margin-left: auto;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
}

.x:hover {
  background: var(--surface-2);
  color: var(--text);
}

.body {
  overflow-y: auto;
  min-height: 0;
  padding: 4px 18px 16px;
}

section {
  padding: 14px 0;
  border-bottom: 1px solid var(--border-soft);
}

section:last-of-type {
  border-bottom: none;
}

h4 {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-faint);
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}

.row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 40px;
}

.row + .row {
  margin-top: 6px;
}

.label {
  flex: 1;
  font-size: 13px;
  color: var(--text);
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.label span {
  font-size: 11.5px;
  color: var(--text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.label .path {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
}

.keycap {
  min-width: 150px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--accent-text);
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.keycap:hover {
  border-color: var(--accent-line);
}

.keycap.recording {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: #fff;
}

.switch {
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: var(--border);
  position: relative;
  cursor: pointer;
  transition: background 0.15s ease;
  flex: none;
}

.switch i {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--text-faint);
  transition: all 0.15s ease;
}

.switch.on {
  background: var(--accent);
}

.switch.on i {
  left: 21px;
  background: #fff;
}

.switch.disabled {
  opacity: 0.5;
}

.ghost {
  padding: 5px 11px;
  border-radius: 7px;
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.ghost:hover {
  border-color: var(--accent-line);
  color: var(--accent-text);
}

.btns {
  display: flex;
  gap: 6px;
}

.segs {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  flex: none;
}

.segs button {
  padding: 5px 11px;
  font-size: 12px;
  color: var(--text-dim);
  cursor: pointer;
  border-right: 1px solid var(--border);
}

.segs button:last-child {
  border-right: none;
}

.segs button:hover {
  background: var(--surface-2);
  color: var(--text);
}

.segs button.on {
  background: var(--accent-soft);
  color: var(--accent-text);
}

.note {
  font-size: 11px;
  color: var(--text-faint);
  line-height: 1.6;
  margin: 2px 0 6px;
}

.err {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--danger);
}

.tip {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--text-faint);
}

.foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 14px;
  font-size: 11px;
  color: var(--text-faint);
}

.sep {
  opacity: 0.5;
}
</style>
