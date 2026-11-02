// 时间分组与折叠状态。分组算法在 src/lib/text.mjs（可在 Node 里测），
// 这里只持有「哪一组被手动展开 / 收起」以及给键盘导航用的可见列表。
import { computed, ref } from 'vue'
import { buildGroups } from '../lib/text.mjs'

const DEFAULT_OPEN_DAYS = 7

export function useGroups(items, config) {
  const collapsedKeys = ref([])
  const expandedKeys = ref([])

  const groups = computed(() =>
    buildGroups(items.value, { sort: config.value.sort || 'updated', now: Date.now() })
  )

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

  const visibleItems = computed(() =>
    groups.value.filter((g) => !isCollapsed(g)).flatMap((g) => g.items)
  )

  return { groups, isCollapsed, toggleGroup, visibleItems }
}
