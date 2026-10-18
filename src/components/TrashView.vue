<template>
  <div class="trash">
    <div class="bar">
      <button class="back" @click="$emit('back')">← 返回</button>
      <span class="title">回收站</span>
      <span class="count">{{ items.length }} 条</span>
      <button v-if="items.length" class="empty-btn" @click="$emit('empty')">清空回收站</button>
    </div>

    <div v-if="items.length" class="list">
      <article v-for="n in items" :key="n.id" class="item">
        <p class="content">{{ plain(n.content) }}</p>
        <div class="foot">
          <span class="time">删除于 {{ fmt(n.deletedAt) }}</span>
          <div class="actions">
            <button @click="$emit('restore', n)">恢复</button>
            <button class="danger" @click="$emit('purge', n)">彻底删除</button>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="empty">
      <div class="mark"></div>
      <p class="t">回收站是空的</p>
      <p class="s">删除的笔记会先放到这里，超过 30 天才自动清理</p>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  items: { type: Array, default: () => [] }
})

defineEmits(['back', 'restore', 'purge', 'empty'])

const TAG_RE = /#([\p{L}\p{N}_\-\/]+)/gu

function plain(text) {
  return String(text).replace(TAG_RE, '').replace(/\s+\n/g, '\n').trim()
}

function fmt(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (x) => String(x).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.trash {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 8px;
  flex: none;
}

.back,
.empty-btn {
  padding: 4px 10px;
  border-radius: 7px;
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
}

.back:hover,
.empty-btn:hover {
  border-color: var(--accent-line);
  color: var(--accent-text);
}

.empty-btn {
  margin-left: auto;
  border-color: var(--danger);
  color: var(--danger);
}

.empty-btn:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: rgba(229, 100, 95, 0.08);
}

.title {
  font-size: 13px;
  color: var(--text);
}

.count {
  font-size: 11.5px;
  color: var(--text-faint);
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item {
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  opacity: 0.72;
  transition: opacity 0.15s ease, border-color 0.15s ease;
}

.item:hover {
  opacity: 1;
  border-color: var(--border);
}

.content {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  color: var(--text-strong);
}

.foot {
  display: flex;
  align-items: center;
  margin-top: 8px;
}

.time {
  font-size: 11.5px;
  color: var(--text-faint);
}

.actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.item:hover .actions {
  opacity: 1;
}

.actions button {
  padding: 2px 8px;
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
  background: rgba(229, 100, 95, 0.12);
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-bottom: 50px;
}

.mark {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  border: 1px dashed var(--border);
  margin-bottom: 4px;
}

.t {
  font-size: 13px;
  color: var(--text-dim);
}

.s {
  font-size: 12px;
  color: var(--text-faint);
}
</style>
