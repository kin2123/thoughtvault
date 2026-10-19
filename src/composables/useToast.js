// Toast 与「撤销」动作：从 App.vue 抽出来的第一块逻辑。
// 只关心状态与计时，不碰 DOM，页面里怎么渲染由模板决定。
import { onBeforeUnmount, ref } from 'vue'

export function useToast() {
  const toast = ref(null)
  let timer = null

  function showToast(text, action, onAction) {
    clearTimeout(timer)
    toast.value = { text, action, onAction }
    // 带撤销按钮的多留一会儿，避免手慢点不到
    timer = setTimeout(() => (toast.value = null), action ? 6000 : 2600)
  }

  function runToastAction() {
    const fn = toast.value && toast.value.onAction
    toast.value = null
    clearTimeout(timer)
    if (fn) fn()
  }

  onBeforeUnmount(() => clearTimeout(timer))

  return { toast, showToast, runToastAction }
}
