// 多选状态：哪些笔记被选中、是否处于多选模式、批量打标签的输入框状态。
// 批量操作本身（删除 / 打标签）留在 App.vue，因为它们要刷新列表、弹 toast。
import { ref } from 'vue'

export function useSelection() {
  const selecting = ref(false)
  const selected = ref([])
  const tagging = ref(false)
  const tagInput = ref('')

  function isSelected(id) {
    return selected.value.includes(id)
  }

  function toggleSelect(id) {
    const i = selected.value.indexOf(id)
    if (i === -1) selected.value = selected.value.concat(id)
    else selected.value = selected.value.filter((x) => x !== id)
  }

  /** 进入/退出多选；退出时顺手清掉选中项与批量标签输入框 */
  function toggleSelectMode() {
    selecting.value = !selecting.value
    if (!selecting.value) {
      selected.value = []
      tagging.value = false
      tagInput.value = ''
    }
  }

  function clearSelection() {
    selected.value = []
    selecting.value = false
    tagging.value = false
    tagInput.value = ''
  }

  return {
    selecting,
    selected,
    tagging,
    tagInput,
    isSelected,
    toggleSelect,
    toggleSelectMode,
    clearSelection
  }
}
