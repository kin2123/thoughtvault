<template>
  <article
    class="note"
    :class="{
      pinned: note.pinned,
      editing,
      selected,
      picking: selecting,
      active
    }"
    @click="$emit('click')"
  >
    <template v-if="!editing">
      <div class="note-main">
        <span v-if="selecting" class="check" :class="{ on: selected }"></span>
        <div v-if="markdown && !selecting" class="md-body" v-html="html"></div>
        <p v-else class="content">{{ text }}</p>
      </div>
      <div class="note-foot">
        <span v-if="note.pinned" class="pin-dot" title="已置顶"></span>
        <span class="time">{{ time }}</span>
        <div v-if="!selecting" class="actions">
          <button @click.stop="$emit('pin')">{{ note.pinned ? '取消置顶' : '置顶' }}</button>
          <button @click.stop="$emit('edit')">编辑</button>
          <button @click.stop="$emit('export')">导出</button>
          <button class="danger" @click.stop="$emit('remove')">删除</button>
        </div>
      </div>
    </template>

    <template v-else>
      <textarea
        ref="inputRef"
        v-model="draft"
        class="input edit-input"
        rows="3"
        spellcheck="false"
        @keydown="onKey"
        @click.stop
      ></textarea>
      <div class="note-foot">
        <span class="hint">Ctrl+Enter 保存 · Esc 取消</span>
        <div class="actions always">
          <button @click.stop="$emit('cancel')">取消</button>
          <button class="primary" @click.stop="$emit('save', draft)">保存</button>
        </div>
      </div>
    </template>
  </article>
</template>

<script setup>
// 单条笔记卡片：只负责「怎么显示」和「草稿状态」，
// 选中/编辑/删除这些动作都交回 App.vue —— 它们要刷新列表、弹 toast。
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  note: { type: Object, required: true },
  editing: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
  selecting: { type: Boolean, default: false },
  markdown: { type: Boolean, default: true },
  html: { type: String, default: '' },
  text: { type: String, default: '' },
  time: { type: String, default: '' }
})

const emit = defineEmits(['click', 'pin', 'edit', 'export', 'remove', 'save', 'cancel'])

const draft = ref('')
const inputRef = ref(null)

// 进入编辑时把正文灌进草稿；退出时留着也无所谓，下次进入会重新灌
watch(
  () => props.editing,
  (on) => {
    if (!on) return
    draft.value = props.note.content
    nextTick(() => {
      const el = inputRef.value
      if (el) el.focus()
    })
  },
  { immediate: true }
)

function onKey(e) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('cancel')
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    emit('save', draft.value)
  }
}
</script>

<style scoped>
.note {
  padding: var(--note-pad-y) var(--note-pad-x);
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

.note.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-soft);
}

/* 搜索命中：用强调色的浅底，不改变字色，避免在暗色主题下刺眼 */
.note :deep(mark.tv-hl) {
  background: var(--accent-soft);
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
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
  line-height: var(--note-leading);
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
</style>
