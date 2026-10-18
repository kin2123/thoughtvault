<template>
  <div class="app">
    <header class="titlebar">
      <div class="brand">
        <span class="logo"></span>
        <span class="name">思库</span>
      </div>
      <div class="spacer"></div>
      <span class="stat">{{ stats.active }} 条</span>
      <button
        class="icon-btn square theme-btn"
        :title="isDark ? '切换为亮色' : '切换为暗色'"
        @click="toggleTheme"
      >
        <svg v-if="isDark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <circle cx="12" cy="12" r="4.1" />
          <path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5 5l1.6 1.6M17.4 17.4L19 19M19 5l-1.6 1.6M6.6 17.4L5 19" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a7 7 0 0 0 11.1 11.1Z" />
        </svg>
      </button>
      <button class="icon-btn" :class="{ on: view === 'trash' }" title="回收站" @click="toggleTrash">
        回收站<i v-if="stats.trash" class="badge">{{ stats.trash }}</i>
      </button>
      <button class="icon-btn" :class="{ on: settingsOpen }" title="设置（Ctrl+,）" @click="settingsOpen = true">
        设置
      </button>
      <button class="icon-btn square" title="收起（Esc）" @click="hideWindow">—</button>
    </header>

    <TrashView
      v-if="view === 'trash'"
      :items="trashItems"
      @back="backToList"
      @restore="restoreItem"
      @purge="purgeItem"
      @empty="clearTrash"
    />

    <template v-else>
      <section class="composer" :class="{ active: composing }">
        <textarea
          ref="inputRef"
          v-model="draft"
          class="input"
          rows="2"
          spellcheck="false"
          placeholder="记点什么…"
          @keydown="onComposeKey"
          @input="autoGrow"
          @paste="onPaste"
          @focus="composing = true"
          @blur="composing = false"
        ></textarea>
        <div class="composer-bar">
          <span class="hint">{{ draftHint }}</span>
          <button class="save" :disabled="!draft.trim()" @click="commit">保存</button>
        </div>
      </section>

      <section class="toolbar">
        <div class="search-row">
          <div class="search-wrap">
            <input
              ref="searchRef"
              v-model="query"
              class="search"
              spellcheck="false"
              placeholder="搜索内容或标签…"
            />
            <button v-if="query" class="clear" @click="query = ''">✕</button>
          </div>
          <button class="chip-btn" :title="'排序：' + sortLabel" @click="cycleSort">
            {{ sortLabel }}
          </button>
          <button class="chip-btn" :class="{ on: selecting }" @click="toggleSelectMode">
            {{ selecting ? '退出多选' : '多选' }}
          </button>
        </div>
        <div v-if="tagList.length" class="tags">
          <button class="tag" :class="{ on: activeTag === '' }" @click="pickTag('')">全部</button>
          <button
            v-for="t in tagList"
            :key="t.name"
            class="tag"
            :class="{ on: activeTag === t.name }"
            @click="pickTag(activeTag === t.name ? '' : t.name)"
          >
            {{ t.name }}<i class="n">{{ t.count }}</i>
          </button>
          <button class="tag manage" title="管理标签" @click="tagManagerOpen = true">⋯</button>
        </div>
      </section>

      <section ref="listRef" v-if="items.length" class="list" @scroll="onListScroll">
        <template v-for="g in groups" :key="g.key">
          <div v-if="g.label" class="group-head" @click="toggleGroup(g)">
            <span class="g-caret" :class="{ open: !isCollapsed(g) }"></span>
            <span class="g-label">{{ g.label }}</span>
            <span class="g-count">{{ g.items.length }}</span>
          </div>

          <template v-if="!isCollapsed(g)">
            <article
              v-for="n in g.items"
              :key="n.id"
              :data-id="n.id"
              v-memo="[n.id, n.updatedAt, n.pinned, editingId === n.id, isSelected(n.id), activeId === n.id, selecting, config.markdown]"
              class="note"
              :class="{
                pinned: n.pinned,
                editing: editingId === n.id,
                selected: isSelected(n.id),
                picking: selecting,
                active: activeId === n.id
              }"
              @click="onNoteClick(n)"
            >
              <template v-if="editingId !== n.id">
                <div class="note-main">
                  <span v-if="selecting" class="check" :class="{ on: isSelected(n.id) }"></span>
                  <div v-if="config.markdown && !selecting" class="md-body" v-html="mdHtml(n)"></div>
                  <p v-else class="content">{{ plain(n.content) }}</p>
                </div>
                <div class="note-foot">
                  <span v-if="n.pinned" class="pin-dot" title="已置顶"></span>
                  <span class="time">{{ fmt(n.updatedAt) }}</span>
                  <div v-if="!selecting" class="actions">
                    <button @click.stop="togglePin(n)">{{ n.pinned ? '取消置顶' : '置顶' }}</button>
                    <button @click.stop="startEdit(n)">编辑</button>
                    <button class="danger" @click.stop="removeItem(n)">删除</button>
                  </div>
                </div>
              </template>
              <template v-else>
                <textarea
                  v-model="editDraft"
                  class="input edit-input"
                  rows="3"
                  spellcheck="false"
                  @keydown="onEditKey"
                  @click.stop
                ></textarea>
                <div class="note-foot">
                  <span class="hint">Ctrl+Enter 保存 · Esc 取消</span>
                  <div class="actions always">
                    <button @click.stop="cancelEdit">取消</button>
                    <button class="primary" @click.stop="commitEdit(n)">保存</button>
                  </div>
                </div>
              </template>
            </article>
          </template>
        </template>
        <p v-if="hasMore" class="more">还有更多，继续往下滚…</p>
      </section>

      <section v-else class="empty">
        <div class="empty-mark"></div>
        <p class="empty-title">{{ stats.active ? '没有匹配的笔记' : '还没有任何记录' }}</p>
        <p class="empty-sub">
          {{ stats.active ? '换个关键词或清空标签筛选试试' : '在上面输入第一句话，按 Enter 存下来' }}
        </p>
      </section>
    </template>

    <div v-if="selecting" class="batchbar">
      <template v-if="tagging">
        <input
          ref="tagInputRef"
          v-model="tagInput"
          class="batch-input"
          spellcheck="false"
          placeholder="输入标签名，回车确认"
          @keydown.enter="submitBatchTag"
          @keydown.esc="tagging = false"
        />
        <button class="batch-btn primary" @click="submitBatchTag">确定</button>
        <button class="batch-btn" @click="tagging = false">取消</button>
      </template>
      <template v-else>
        <span class="batch-count">已选 {{ selected.length }} 条</span>
        <button class="batch-btn" :disabled="!selected.length" @click="openTagInput">打标签</button>
        <button class="batch-btn danger" :disabled="!selected.length" @click="batchRemove">删除</button>
        <button class="batch-btn" @click="toggleSelectMode">取消</button>
      </template>
    </div>

    <footer v-else class="statusbar">
      <span>{{ isDesktop ? prettyHotkey(config.hotkeyActive) + ' 随时唤出' : '浏览器预览模式' }}</span>
      <span class="dot"></span>
      <span>{{ isDesktop ? 'SQLite · 数据存于本机' : '数据存 localStorage' }}</span>
    </footer>

    <SettingsPanel
      v-if="settingsOpen"
      :config="config"
      :note-count="stats.active"
      @close="settingsOpen = false"
      @update="patchConfig"
      @backup="doBackup"
      @export="doExport"
      @import="doImport"
      @open-dir="doOpenDir"
      @manage-tags="openTagManager"
      @change-data-dir="doChangeDataDir"
      @reset-data-dir="doResetDataDir"
      @toast="(t) => showToast(t.text)"
    />

    <TagManager
      v-if="tagManagerOpen"
      :tags="tagList"
      @close="tagManagerOpen = false"
      @rename="doRenameTag"
      @remove="doRemoveTag"
    />

    <div v-if="showOnboarding" class="onboard">
      <div class="card">
        <h3>思库已经在你机器上了</h3>
        <ul>
          <li><b>{{ prettyHotkey(config.hotkeyActive) }}</b> 随时唤出，再按一次收起</li>
          <li>打完字按 <b>Enter</b> 存下，<b>Shift + Enter</b> 换行</li>
          <li>正文里写 <b>#标签</b> 会自动归类，点顶部标签就能筛</li>
          <li>图片直接 <b>Ctrl + V</b> 粘进来，存在本地</li>
          <li>设置里能改快捷键、主题、字号，还有备份和导出</li>
        </ul>
        <button class="know" @click="dismissOnboarding">知道了</button>
      </div>
    </div>

    <transition name="toast">
      <div v-if="toast" class="toast">
        <span class="toast-text">{{ toast.text }}</span>
        <button v-if="toast.action" class="toast-action" @click="runToastAction">
          {{ toast.action }}
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import {
  addTagsToNotes,
  backupNow,
  batchDeleteNotes,
  clearDraft,
  createNote,
  deleteNote,
  deleteTag,
  emptyTrash,
  exportAll,
  exportFile,
  exportFileName,
  getConfig,
  getStats,
  hideWindow,
  importJson,
  isDesktop,
  bootstrapNotes,
  listTags,
  listTrash,
  loadDraft,
  notesToMarkdown,
  onFocusInput,
  onOpenPanel,
  openDir,
  pickDataDir,
  prettyHotkey,
  purgeNote,
  relocateDataDir,
  resetDataDir,
  renameTag,
  restoreNote,
  saveAsset,
  saveDraft,
  setConfig,
  setPinned,
  updateNote
} from './api'
import SettingsPanel from './components/SettingsPanel.vue'
import TagManager from './components/TagManager.vue'
import TrashView from './components/TrashView.vue'

const TAG_RE = /#([\p{L}\p{N}_\-\/]+)/gu
const PAGE_SIZE = 80

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const mdCache = new Map()

const items = ref([])
const trashItems = ref([])
const tagList = ref([])
const stats = ref({ active: 0, trash: 0 })

const draft = ref('')
const query = ref('')
const activeTag = ref('')
const editingId = ref(null)
const editDraft = ref('')
const composing = ref(false)
const view = ref('list')
const settingsOpen = ref(false)
const tagManagerOpen = ref(false)

const selecting = ref(false)
const selected = ref([])
const tagging = ref(false)
const tagInput = ref('')

const limit = ref(PAGE_SIZE)
const hasMore = ref(false)

const config = ref({
  hotkeyActive: '',
  hideOnBlur: true,
  isPackaged: false,
  appVersion: '0.4.0',
  theme: 'system',
  fontSize: 'm',
  markdown: true,
  sort: 'updated',
  onboarded: true
})

const toast = ref(null)
const inputRef = ref(null)
const searchRef = ref(null)
const listRef = ref(null)
const tagInputRef = ref(null)

let offFocusInput = () => {}
let offOpenPanel = () => {}
let draftTimer = null
let searchTimer = null
let toastTimer = null
let mediaQuery = null
// 滚动续载的两个闸门，见 onListScroll
let loadingMore = false
let scrollRafPending = false

/* ---------- 生命周期 ---------- */

onMounted(async () => {
  const [savedDraft, cfg] = await Promise.all([loadDraft(), getConfig()])
  config.value = cfg
  applyAppearance()

  await refreshAll()

  if (savedDraft) {
    draft.value = savedDraft
    nextTick(growToFit)
  }

  offFocusInput = onFocusInput(() => {
    nextTick(() => inputRef.value && inputRef.value.focus())
  })
  offOpenPanel = onOpenPanel((panel) => {
    if (panel === 'settings') settingsOpen.value = true
    if (panel === 'trash') {
      view.value = 'trash'
      refreshSide()
    }
    if (panel === 'new') {
      view.value = 'list'
      nextTick(() => inputRef.value && inputRef.value.focus())
    }
  })

  window.addEventListener('keydown', onGlobalKey)

  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', applyAppearance)
})

onBeforeUnmount(() => {
  offFocusInput && offFocusInput()
  offOpenPanel && offOpenPanel()
  window.removeEventListener('keydown', onGlobalKey)
  clearTimeout(draftTimer)
  clearTimeout(searchTimer)
  clearTimeout(toastTimer)
  if (mediaQuery) mediaQuery.removeEventListener('change', applyAppearance)
})

/* ---------- 外观 ---------- */

const isDark = ref(true)

function applyAppearance() {
  const theme = config.value.theme || 'system'
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && sysDark)
  const root = document.documentElement
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.size = config.value.fontSize || 'm'
  isDark.value = dark
}

/** 标题栏的一键切换：明确指定深/浅，不再跟随系统 */
async function toggleTheme() {
  const next = isDark.value ? 'light' : 'dark'
  config.value = { ...config.value, theme: next }
  applyAppearance()
  await setConfig({ theme: next })
}

watch(
  () => [config.value.theme, config.value.fontSize],
  () => applyAppearance()
)

const showOnboarding = computed(() => isDesktop && config.value.onboarded === false)

async function dismissOnboarding() {
  config.value = { ...config.value, onboarded: true }
  await setConfig({ onboarded: true })
}

/* ---------- 数据刷新 ---------- */

async function refreshList() {
  // 一次 IPC 拿齐列表 + 标签 + 计数，省掉三次往返
  const res = await bootstrapNotes({
    query: query.value,
    tag: activeTag.value,
    sort: config.value.sort || 'updated',
    limit: limit.value
  })
  items.value = res.list
  tagList.value = res.tags
  stats.value = res.stats
  hasMore.value = res.list.length >= limit.value
}

async function refreshTrash() {
  trashItems.value = await listTrash()
}

async function refreshSide() {
  const [tags, st] = await Promise.all([listTags(), getStats()])
  tagList.value = tags
  stats.value = st
  // 回收站列表只在回收站视图里才有意义，平时不拉
  if (view.value === 'trash') await refreshTrash()
}

async function refreshAll() {
  await refreshList()
  if (view.value === 'trash') await refreshTrash()
}

function resetPaging() {
  limit.value = PAGE_SIZE
  // 换搜索词/换标签时要把闸门一起松开，否则上一次的在途标记会挡住新查询
  loadingMore = false
}

// 滚动续载要挡住两件事：
// ① refreshList 是异步的，await 期间同一个位置会继续收到 scroll 事件，
//    每次加 80 会让 limit 一次跳到 240、400，然后触发一次超大的重渲染；
// ② 读 scrollTop / clientHeight / scrollHeight 会强制布局刷新，
//    不节流的话每个 scroll 事件都来一次。
function onListScroll(e) {
  if (!hasMore.value || loadingMore || scrollRafPending) return
  const el = e.target
  scrollRafPending = true
  requestAnimationFrame(() => {
    scrollRafPending = false
    // 进 rAF 后重新判一次，期间状态可能已经变了
    if (loadingMore || !hasMore.value) return
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 120) return
    loadingMore = true
    limit.value += PAGE_SIZE
    refreshList().finally(() => {
      loadingMore = false
    })
  })
}

/* ---------- 时间分组 ---------- */

const DEFAULT_OPEN_DAYS = 7
const collapsedKeys = ref([])
const expandedKeys = ref([])

const useGroups = computed(() => (config.value.sort || 'updated') !== 'length')

function pad2(n) {
  return String(n).padStart(2, '0')
}

function groupTs(n) {
  return (config.value.sort || 'updated') === 'created' ? n.createdAt : n.updatedAt
}

function dayKey(n) {
  const d = new Date(groupTs(n))
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

function dayLabel(ts) {
  const d = new Date(ts)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((today - day) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${week}`
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

const groups = computed(() => {
  if (!useGroups.value) return [{ key: '_all', label: null, ts: 0, items: items.value }]
  const out = []
  const index = new Map()
  for (const n of items.value) {
    const key = dayKey(n)
    if (!index.has(key)) {
      const g = { key, label: dayLabel(groupTs(n)), ts: groupTs(n), items: [] }
      index.set(key, g)
      out.push(g)
    }
    index.get(key).items.push(n)
  }
  return out
})

/** 手动展开优先，其次手动收起，都不是则按「7 天内默认展开」 */
function isCollapsed(g) {
  if (expandedKeys.value.includes(g.key)) return false
  if (collapsedKeys.value.includes(g.key)) return true
  return Date.now() - g.ts > DEFAULT_OPEN_DAYS * 86400000
}

function toggleGroup(g) {
  if (isCollapsed(g)) {
    collapsedKeys.value = collapsedKeys.value.filter((k) => k !== g.key)
    if (!expandedKeys.value.includes(g.key)) expandedKeys.value = expandedKeys.value.concat(g.key)
  } else {
    expandedKeys.value = expandedKeys.value.filter((k) => k !== g.key)
    if (!collapsedKeys.value.includes(g.key)) collapsedKeys.value = collapsedKeys.value.concat(g.key)
  }
}

/* ---------- 键盘导航 ---------- */

const activeId = ref('')

const visibleItems = computed(() =>
  groups.value.filter((g) => !isCollapsed(g)).flatMap((g) => g.items)
)

function moveActive(delta) {
  const list = visibleItems.value
  if (!list.length) return
  const i = list.findIndex((n) => n.id === activeId.value)
  let next
  if (i === -1) next = delta > 0 ? 0 : list.length - 1
  else next = Math.min(list.length - 1, Math.max(0, i + delta))
  activeId.value = list[next].id
  nextTick(() => {
    const el = document.querySelector('.note[data-id="' + activeId.value + '"]')
    if (el) el.scrollIntoView({ block: 'nearest' })
  })
}

/* ---------- 全局按键 ---------- */

function onGlobalKey(e) {
  const tag = (e.target && e.target.tagName) || ''
  const typing = tag === 'INPUT' || tag === 'TEXTAREA'
  if (!typing && view.value === 'list' && !settingsOpen.value && !tagManagerOpen.value && !selecting.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveActive(1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveActive(-1)
      return
    }
    if (e.key === 'Enter' && activeId.value) {
      const n = items.value.find((x) => x.id === activeId.value)
      if (n) {
        e.preventDefault()
        startEdit(n)
        return
      }
    }
  }

  if (e.key === 'Escape') {
    if (tagManagerOpen.value) {
      tagManagerOpen.value = false
    } else if (settingsOpen.value) {
      settingsOpen.value = false
    } else if (editingId.value) {
      cancelEdit()
    } else if (selecting.value) {
      toggleSelectMode()
    } else if (view.value === 'trash') {
      backToList()
    } else {
      hideWindow()
      if (inputRef.value) inputRef.value.blur()
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (view.value !== 'list') backToList()
    nextTick(() => searchRef.value && searchRef.value.focus())
  }
  if ((e.ctrlKey || e.metaKey) && e.key === ',') {
    e.preventDefault()
    settingsOpen.value = !settingsOpen.value
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && selecting.value) {
    e.preventDefault()
    selected.value = items.value.map((n) => n.id)
  }
}

/* ---------- 草稿与搜索 ---------- */

watch(draft, (text) => {
  clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    if (text) saveDraft(text)
    else clearDraft()
  }, 400)
})

watch(query, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    resetPaging()
    refreshList()
  }, 220)
})

const draftHint = computed(() => {
  if (!draft.value) return 'Enter 保存 · Shift+Enter 换行 · #标签 · 图片可粘贴'
  return `${draft.value.length} 字 · 已自动存草稿 · Enter 保存`
})

/* ---------- 文本 ---------- */

function parseTags(text) {
  const out = []
  for (const m of text.matchAll(TAG_RE)) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

function stripTags(text) {
  return String(text).replace(TAG_RE, '').replace(/[ \t]+\n/g, '\n').trim()
}

function plain(text) {
  return stripTags(text)
}

function mdHtml(n) {
  const key = n.id + ':' + n.updatedAt
  const hit = mdCache.get(key)
  if (hit) return hit
  const html = md.render(stripTags(n.content))
  if (mdCache.size > 400) mdCache.clear()
  mdCache.set(key, html)
  return html
}

function fmt(ts) {
  const d = new Date(ts)
  const now = new Date()
  const pad = (x) => String(x).padStart(2, '0')
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes())
  if (d.toDateString() === now.toDateString()) return '今天 ' + hm
  const y = new Date(now.getTime() - 86400000)
  if (d.toDateString() === y.toDateString()) return '昨天 ' + hm
  if (d.getFullYear() === now.getFullYear()) {
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hm
  }
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/* ---------- 输入 ---------- */

function autoGrow(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 220) + 'px'
}

function growToFit() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 220) + 'px'
  el.focus()
  el.setSelectionRange(el.value.length, el.value.length)
}

async function commit() {
  const text = draft.value.trim()
  if (!text) return
  await createNote({ content: text, tags: parseTags(text) })
  draft.value = ''
  clearDraft()
  resetPaging()
  nextTick(() => {
    const el = inputRef.value
    if (el) {
      el.style.height = 'auto'
      el.focus()
    }
  })
  await refreshAll()
}

function onComposeKey(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    commit()
  }
}

/* ---------- 粘贴图片 ---------- */

async function onPaste(e) {
  const items = (e.clipboardData && e.clipboardData.items) || []
  for (const item of items) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    e.preventDefault()
    const file = item.getAsFile()
    if (!file) return
    const ext = (item.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
    const buffer = new Uint8Array(await file.arrayBuffer())
    const res = await saveAsset(buffer, ext)
    if (res && res.ok) {
      insertAtCursor(`\n![](${res.url})\n`)
      showToast('图片已存到本地 assets')
    } else {
      showToast((res && res.error) || '图片保存失败')
    }
    return
  }
}

function insertAtCursor(text) {
  const el = inputRef.value
  if (!el) {
    draft.value += text
    return
  }
  const start = el.selectionStart
  const end = el.selectionEnd
  const value = draft.value
  draft.value = value.slice(0, start) + text + value.slice(end)
  nextTick(() => {
    el.focus()
    const pos = start + text.length
    el.setSelectionRange(pos, pos)
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 220) + 'px'
  })
}

/* ---------- 笔记操作 ---------- */

async function togglePin(n) {
  await setPinned(n.id, !n.pinned)
  await refreshList()
}

async function removeItem(n) {
  await deleteNote(n.id)
  await refreshAll()
  showToast('已移入回收站', '撤销', () => restoreItem(n, true))
}

function onNoteClick(n) {
  activeId.value = n.id
  if (!selecting.value) return
  toggleSelect(n.id)
}

function startEdit(n) {
  if (selecting.value) return
  editingId.value = n.id
  editDraft.value = n.content
}

function cancelEdit() {
  editingId.value = null
  editDraft.value = ''
}

async function commitEdit(n) {
  const text = editDraft.value.trim()
  if (text) {
    await updateNote(n.id, { content: text, tags: parseTags(text) })
  }
  cancelEdit()
  await refreshAll()
}

function onEditKey(e) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    cancelEdit()
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    const n = items.value.find((x) => x.id === editingId.value)
    if (n) commitEdit(n)
  }
}

/* ---------- 筛选与排序 ---------- */

function pickTag(name) {
  activeTag.value = name
  resetPaging()
  refreshList()
}

const SORTS = ['updated', 'created', 'length']
const SORT_LABELS = { updated: '最近更新', created: '最新创建', length: '篇幅最长' }
const sortLabel = computed(() => SORT_LABELS[config.value.sort] || SORT_LABELS.updated)

async function cycleSort() {
  const cur = config.value.sort || 'updated'
  const next = SORTS[(SORTS.indexOf(cur) + 1) % SORTS.length]
  config.value = { ...config.value, sort: next }
  await setConfig({ sort: next })
  resetPaging()
  await refreshList()
  showToast('排序：' + SORT_LABELS[next])
}

/* ---------- 多选与批量 ---------- */

function toggleSelectMode() {
  selecting.value = !selecting.value
  if (!selecting.value) {
    selected.value = []
    tagging.value = false
    tagInput.value = ''
  }
}

function isSelected(id) {
  return selected.value.includes(id)
}

function toggleSelect(id) {
  const i = selected.value.indexOf(id)
  if (i === -1) selected.value = selected.value.concat(id)
  else selected.value = selected.value.filter((x) => x !== id)
}

function openTagInput() {
  tagging.value = true
  nextTick(() => tagInputRef.value && tagInputRef.value.focus())
}

async function submitBatchTag() {
  const tags = tagInput.value
    .split(/[\s,，]+/)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)
  if (!tags.length) return
  const res = await addTagsToNotes(selected.value, tags)
  tagging.value = false
  tagInput.value = ''
  await refreshAll()
  if (res && res.ok) showToast(`已给 ${res.affected} 条打上标签`)
  else showToast((res && res.error) || '打标签失败')
}

async function batchRemove() {
  const n = await batchDeleteNotes(selected.value)
  selected.value = []
  selecting.value = false
  await refreshAll()
  showToast(`已删除 ${n} 条`)
}

/* ---------- 标签管理 ---------- */

function openTagManager() {
  settingsOpen.value = false
  tagManagerOpen.value = true
}

async function doRenameTag(from, to) {
  const res = await renameTag(from, to)
  await refreshAll()
  if (res && res.ok) showToast(`已把「${from}」改成「${to}」，影响 ${res.affected} 条`)
  else showToast((res && res.error) || '改名失败')
}

async function doRemoveTag(name) {
  const res = await deleteTag(name)
  await refreshAll()
  if (res && res.ok) showToast(`已删除标签「${name}」，影响 ${res.affected} 条`)
  else showToast((res && res.error) || '删除失败')
}

/* ---------- 回收站 ---------- */

function backToList() {
  view.value = 'list'
  refreshList()
}

function toggleTrash() {
  if (view.value === 'trash') {
    backToList()
  } else {
    // 进回收站前先退出多选，否则批量操作会作用在看不见的条目上
    if (selecting.value) toggleSelectMode()
    view.value = 'trash'
    refreshTrash()
    refreshSide()
  }
}

async function restoreItem(n, silent) {
  await restoreNote(n.id)
  await refreshAll()
  if (!silent) showToast('已恢复')
}

async function purgeItem(n) {
  await purgeNote(n.id)
  await refreshSide()
  showToast('已彻底删除')
}

async function clearTrash() {
  const count = await emptyTrash()
  await refreshSide()
  showToast(`已清空 ${count} 条`)
}

/* ---------- 设置 / 备份 / 导入导出 ---------- */

async function patchConfig(patch) {
  config.value = { ...config.value, ...(await setConfig(patch)) }
  if ('sort' in patch) {
    resetPaging()
    refreshList()
  }
}

async function doBackup() {
  const res = await backupNow()
  if (res && res.ok) {
    config.value = { ...config.value, lastBackupAt: res.at }
    showToast('已备份：' + res.name)
  } else {
    showToast((res && res.error) || '备份失败')
  }
}

async function doExport(kind) {
  const all = await exportAll()
  if (!all.length) return showToast('还没有可导出的笔记')
  const content =
    kind === 'md' ? notesToMarkdown(all) : JSON.stringify({ version: 1, notes: all }, null, 2)
  const res = await exportFile({ defaultName: exportFileName(kind), content })
  if (res && res.ok) showToast('已导出到 ' + res.path)
  else if (res && !res.canceled) showToast(res.error || '导出失败')
}

async function doImport() {
  const res = await importJson()
  if (!res || res.canceled) return
  if (!res.ok) return showToast(res.error || '导入失败')
  await refreshAll()
  showToast(res.added ? `已导入 ${res.added} 条` : '没有新笔记，全部重复')
}

/** 搬迁完成后：配置、草稿、列表全部按新目录重来一遍 */
async function afterRelocate(res, okText) {
  config.value = await getConfig()
  applyAppearance()
  draft.value = (await loadDraft()) || ''
  resetPaging()
  await refreshAll()
  showToast(okText + ' → ' + res.path)
}

async function doChangeDataDir() {
  const picked = await pickDataDir()
  if (!picked || !picked.ok) return
  const res = await relocateDataDir(picked.path)
  if (!res.ok) {
    if (!res.canceled) showToast(res.error || '更改失败')
    return
  }
  if (res.mode === 'same') return showToast('位置没有变化')
  await afterRelocate(res, res.mode === 'attached' ? '已切换到该目录的笔记' : '已搬移数据')
}

async function doResetDataDir() {
  const res = await resetDataDir()
  if (!res.ok) {
    if (!res.canceled) showToast(res.error || '恢复失败')
    return
  }
  await afterRelocate(res, res.mode === 'attached' ? '已切回默认位置的笔记' : '已搬回默认位置')
}

async function doOpenDir(which) {
  const res = await openDir(which)
  if (typeof res === 'string' && res) showToast('无法打开目录：' + res)
}

/* ---------- Toast ---------- */

function showToast(text, action, onAction) {
  clearTimeout(toastTimer)
  toast.value = { text, action, onAction }
  toastTimer = setTimeout(() => (toast.value = null), action ? 6000 : 2600)
}

function runToastAction() {
  const fn = toast.value && toast.value.onAction
  toast.value = null
  if (fn) fn()
}
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  position: relative;
}

.titlebar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 10px 0 16px;
  -webkit-app-region: drag;
  border-bottom: 1px solid var(--border-soft);
  flex: none;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.name {
  font-size: 13px;
  letter-spacing: 0.04em;
  color: var(--text);
  opacity: 0.85;
}

.spacer {
  flex: 1;
}

.stat {
  font-size: var(--caption);
  color: var(--text-faint);
  margin-right: 4px;
}

.icon-btn {
  -webkit-app-region: no-drag;
  position: relative;
  padding: 0 9px;
  height: 26px;
  border-radius: 7px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}

.icon-btn.square {
  width: 26px;
  padding: 0;
  font-size: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.theme-btn svg {
  width: 15px;
  height: 15px;
  display: block;
}

.icon-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.icon-btn.on {
  background: var(--accent-soft);
  color: var(--accent-text);
}

.badge {
  display: inline-block;
  margin-left: 4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--accent-line);
  color: var(--accent-text);
  font-size: 9px;
  font-style: normal;
  line-height: 14px;
  text-align: center;
  vertical-align: 1px;
}

.composer {
  margin: var(--s4) var(--s4) 0;
  padding: var(--s3) var(--s3) var(--s2);
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  transition: border-color 0.15s ease;
  flex: none;
}

.composer.active {
  border-color: var(--accent-line);
}

.input {
  width: 100%;
  background: transparent;
  resize: none;
  font-size: var(--content-size);
  line-height: 1.65;
  color: var(--text);
  min-height: 46px;
  max-height: 220px;
  overflow-y: auto;
}

.input::placeholder {
  color: var(--text-faint);
}

.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  min-height: 26px;
}

.hint {
  font-size: var(--caption);
  color: var(--text-faint);
}

.save {
  padding: 4px 14px;
  border-radius: 7px;
  background: var(--accent);
  color: #fff;
  font-size: 12.5px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.save:disabled {
  opacity: 0.3;
  cursor: default;
}

.toolbar {
  padding: var(--s3) var(--s4) var(--s2);
  flex: none;
}

.search-row {
  display: flex;
  gap: 6px;
}

.search-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.search {
  width: 100%;
  height: 34px;
  padding: 0 var(--s6) 0 var(--s3);
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 9px;
  font-size: 13px;
}

.search:focus {
  border-color: var(--accent-line);
}

.search::placeholder {
  color: var(--text-faint);
}

.clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
}

.clear:hover {
  background: var(--surface-2);
}

.chip-btn {
  flex: none;
  height: 34px;
  padding: 0 10px;
  border-radius: 9px;
  border: 1px solid var(--border-soft);
  background: var(--surface);
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.chip-btn:hover {
  border-color: var(--accent-line);
  color: var(--text);
}

.chip-btn.on {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent-text);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  align-items: center;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.12s ease;
}

.tag:hover {
  color: var(--text);
  border-color: var(--accent-line);
}

.tag.on {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent-text);
}

.tag .n {
  font-style: normal;
  font-size: 10.5px;
  opacity: 0.6;
}

.tag.manage {
  padding: 3px 8px;
  color: var(--text-faint);
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: var(--s1) var(--s4) var(--s3);
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}

.group-head {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: var(--s2) var(--s4) var(--s1);
  margin: 0 calc(-1 * var(--s4));
  background: var(--bg);
  font-size: 11.5px;
  color: var(--text-faint);
  cursor: pointer;
  user-select: none;
}

.group-head:hover {
  color: var(--text-dim);
}

.g-caret {
  width: 0;
  height: 0;
  border-left: 4px solid currentColor;
  border-top: 3.5px solid transparent;
  border-bottom: 3.5px solid transparent;
  opacity: 0.65;
  transition: transform 0.15s ease;
}

.g-caret.open {
  transform: rotate(90deg);
}

.g-label {
  letter-spacing: 0.04em;
  font-weight: 500;
}

.g-count {
  opacity: 0.55;
  font-size: 10.5px;
}

.note.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-soft);
}

.note {
  padding: var(--s3) var(--s4);
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  transition: border-color 0.12s ease, background 0.12s ease;
}

.note:hover {
  border-color: var(--border);
}

:root[data-theme='dark'] .note:not(.pinned):not(.selected):hover {
  background: var(--surface-2);
}

.note.picking {
  cursor: pointer;
}

.note.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.note.pinned {
  border-color: var(--pinned-border);
  background: linear-gradient(180deg, var(--pinned-from), var(--surface));
}

.note.editing {
  border-color: var(--accent-line);
}

.note-main {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.check {
  flex: none;
  width: 15px;
  height: 15px;
  margin-top: 3px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg);
}

.check.on {
  background: var(--accent);
  border-color: var(--accent);
  position: relative;
}

.check.on::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 8px;
  border: solid #fff;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(42deg);
}

.content {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: var(--content-size);
  color: var(--text-strong);
}

.note-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.pin-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}

.time {
  font-size: var(--caption);
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}

.actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.note:hover .actions,
.note.editing .actions,
.actions.always {
  opacity: 1;
}

.actions button {
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11.5px;
  color: var(--text-dim);
  cursor: pointer;
}

.actions button:hover {
  background: var(--surface-2);
  color: var(--text);
}

.actions .danger:hover {
  color: var(--danger);
  background: transparent;
}

.actions .primary {
  color: var(--accent-text);
}

.edit-input {
  min-height: 64px;
}

.more {
  text-align: center;
  font-size: 11.5px;
  color: var(--text-faint);
  padding: 6px 0 10px;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-bottom: 40px;
}

.empty-mark {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  border: 1px dashed var(--border);
  margin-bottom: 4px;
}

.empty-title {
  font-size: 13px;
  color: var(--text-dim);
}

.empty-sub {
  font-size: 12px;
  color: var(--text-faint);
}

.statusbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 16px;
  border-top: 1px solid var(--border-soft);
  font-size: 11px;
  color: var(--text-faint);
}

.dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--border);
}

.batchbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 16px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.batch-count {
  font-size: 12px;
  color: var(--text-dim);
  margin-right: auto;
}

.batch-btn {
  padding: 5px 12px;
  border-radius: 7px;
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-dim);
  cursor: pointer;
}

.batch-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.batch-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.batch-btn.danger:hover {
  color: var(--danger);
  border-color: var(--danger);
  background: transparent;
}

.batch-btn.primary {
  border-color: var(--accent-line);
  color: var(--accent-text);
}

.batch-input {
  flex: 1;
  height: 28px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid var(--accent-line);
  background: var(--bg);
  font-size: 12.5px;
  color: var(--text);
  user-select: text;
}

.onboard {
  position: absolute;
  inset: 0;
  background: var(--mask);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 70;
}

.card {
  width: min(430px, calc(100% - 40px));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 22px 22px 18px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
}

.card h3 {
  font-size: 14.5px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 12px;
}

.card ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-bottom: 18px;
}

.card li {
  font-size: 12.5px;
  color: var(--text-dim);
  line-height: 1.6;
  padding-left: 14px;
  position: relative;
}

.card li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.7;
}

.card b {
  color: var(--text);
  font-weight: 500;
}

.know {
  width: 100%;
  height: 34px;
  border-radius: 9px;
  background: var(--accent);
  color: #fff;
  font-size: 12.5px;
  cursor: pointer;
}

.toast {
  position: absolute;
  left: 50%;
  bottom: 44px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 14px;
  background: var(--toast-bg);
  border: 1px solid var(--toast-border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 60;
  max-width: calc(100% - 40px);
}

.toast-text {
  font-size: 12.5px;
  color: var(--text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toast-action {
  font-size: 12.5px;
  color: var(--accent-text);
  cursor: pointer;
  white-space: nowrap;
  padding: 2px 6px;
  border-radius: 6px;
}

.toast-action:hover {
  background: var(--accent-soft);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(6px);
}
</style>
