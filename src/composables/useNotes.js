// 列表数据与检索状态：列表、标签、回收站、计数、搜索 / 筛选 / 排序 / 分页。
// 只负责「向主进程要数据」，编辑、删除、批量这些流程留在 App.vue ——
// 它们还要弹 toast、做撤销，属于动作编排而不是数据源。
import { computed, ref } from 'vue'
import { bootstrapNotes, getStats, listTags, listTrash, setConfig } from '../api'

const PAGE_SIZE = 80
const SORTS = ['updated', 'created', 'length']
const SORT_LABELS = { updated: '最近更新', created: '最新创建', length: '篇幅最长' }

export function useNotes({ config, isTrashView, showToast }) {
  const items = ref([])
  const trashItems = ref([])
  const tagList = ref([])
  const stats = ref({ active: 0, trash: 0 })

  const query = ref('')
  const activeTag = ref('')
  const limit = ref(PAGE_SIZE)
  const hasMore = ref(false)

  // 列表请求的序号：refreshList 之间是并发 IPC，回来的顺序不保证。
  // 快速输入时「学」的结果可能比「学习」晚到，把新结果覆盖成旧的。
  let listSeq = 0
  // 滚动续载的两个闸门，见 onListScroll
  let loadingMore = false
  let scrollRafPending = false

  async function refreshList({ withTags = true } = {}) {
    const seq = ++listSeq
    // 一次 IPC 拿齐列表 + 标签 + 计数，省掉三次往返
    const res = await bootstrapNotes({
      query: query.value,
      tag: activeTag.value,
      sort: config.value.sort || 'updated',
      limit: limit.value,
      withTags
    })
    // 期间已经发起了更新的请求，这次的结果作废
    if (seq !== listSeq) return
    items.value = res.list
    // 跳过标签统计时不要把已有的标签列表覆盖成 undefined
    if (res.tags) tagList.value = res.tags
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
    if (isTrashView()) await refreshTrash()
  }

  async function refreshAll() {
    await refreshList()
    if (isTrashView()) await refreshTrash()
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
      // 续载只影响列表，标签统计没必要跟着重算
      refreshList({ withTags: false }).finally(() => {
        loadingMore = false
      })
    })
  }

  function pickTag(name) {
    activeTag.value = name
    resetPaging()
    refreshList({ withTags: false })
  }

  const sortLabel = computed(() => SORT_LABELS[config.value.sort] || SORT_LABELS.updated)

  async function cycleSort() {
    const cur = config.value.sort || 'updated'
    const next = SORTS[(SORTS.indexOf(cur) + 1) % SORTS.length]
    config.value = { ...config.value, sort: next }
    await setConfig({ sort: next })
    resetPaging()
    await refreshList({ withTags: false })
    showToast('排序：' + SORT_LABELS[next])
  }

  return {
    items,
    trashItems,
    tagList,
    stats,
    query,
    activeTag,
    hasMore,
    sortLabel,
    refreshList,
    refreshTrash,
    refreshSide,
    refreshAll,
    resetPaging,
    onListScroll,
    pickTag,
    cycleSort
  }
}
