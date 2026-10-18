<template>
  <div class="mask" @mousedown.self="$emit('close')">
    <div class="panel">
      <header class="head">
        <span class="title">标签管理</span>
        <span class="sub">{{ tags.length }} 个标签</span>
        <button class="x" title="关闭" @click="$emit('close')">✕</button>
      </header>

      <div class="body">
        <p v-if="!tags.length" class="empty">还没有标签。在正文里写 <code>#标签名</code> 就会自动生成。</p>

        <div v-for="t in tags" :key="t.name" class="row">
          <template v-if="editing === t.name">
            <input
              v-model="draft"
              class="input"
              spellcheck="false"
              placeholder="新的标签名"
              @keydown.enter="commitRename(t)"
              @keydown.esc="cancel"
            />
            <button class="mini primary" @click="commitRename(t)">确定</button>
            <button class="mini" @click="cancel">取消</button>
          </template>
          <template v-else>
            <span class="name">{{ t.name }}</span>
            <span class="count">{{ t.count }}</span>
            <div class="acts">
              <template v-if="confirming === t.name">
                <span class="warn">删除后正文里的 #{{ t.name }} 也会去掉</span>
                <button class="mini danger" @click="$emit('remove', t.name)">确认删除</button>
                <button class="mini" @click="confirming = ''">取消</button>
              </template>
              <template v-else>
                <button class="mini" @click="startRename(t)">重命名</button>
                <button class="mini danger" @click="confirming = t.name">删除</button>
              </template>
            </div>
          </template>
        </div>
      </div>

      <footer class="foot">
        重命名时正文里的 <code>#旧名</code> 会一起改掉，不会因为下次编辑又变回去。
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  tags: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'rename', 'remove'])

const editing = ref('')
const draft = ref('')
const confirming = ref('')

function startRename(t) {
  editing.value = t.name
  draft.value = t.name
  confirming.value = ''
}

function cancel() {
  editing.value = ''
  draft.value = ''
}

function commitRename(t) {
  const next = draft.value.trim().replace(/^#/, '')
  if (!next) return
  if (next === t.name) return cancel()
  emit('rename', t.name, next)
  cancel()
}
</script>

<style scoped>
.mask {
  position: absolute;
  inset: 0;
  background: var(--mask);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 55;
}

.panel {
  width: min(520px, calc(100% - 40px));
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 12px 0 18px;
  border-bottom: 1px solid var(--border-soft);
  flex: none;
}

.title {
  font-size: 13.5px;
  color: var(--text);
}

.sub {
  font-size: 11.5px;
  color: var(--text-faint);
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
  padding: 8px 18px;
}

.empty {
  font-size: 12.5px;
  color: var(--text-faint);
  padding: 14px 0;
  line-height: 1.8;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  border-bottom: 1px solid var(--border-soft);
}

.row:last-child {
  border-bottom: none;
}

.name {
  font-size: 13px;
  color: var(--text);
}

.count {
  font-size: 11px;
  color: var(--text-faint);
}

.acts {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.warn {
  font-size: 11px;
  color: var(--text-faint);
}

.input {
  flex: 1;
  height: 30px;
  padding: 0 10px;
  background: var(--bg);
  border: 1px solid var(--accent-line);
  border-radius: 7px;
  font-size: 12.5px;
  color: var(--text);
  user-select: text;
}

.mini {
  padding: 3px 9px;
  border-radius: 6px;
  border: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--text-dim);
  cursor: pointer;
  white-space: nowrap;
}

.mini:hover {
  background: var(--surface-2);
  color: var(--text);
}

.mini.primary {
  border-color: var(--accent-line);
  color: var(--accent-text);
}

.mini.danger:hover {
  color: var(--danger);
  border-color: var(--danger);
  background: transparent;
}

.foot {
  flex: none;
  padding: 10px 18px;
  border-top: 1px solid var(--border-soft);
  font-size: 11px;
  color: var(--text-faint);
  line-height: 1.7;
}

code {
  font-family: ui-monospace, Consolas, monospace;
  background: var(--surface-2);
  padding: 0 4px;
  border-radius: 4px;
}
</style>
