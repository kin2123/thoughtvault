// 主题、字号、强调色、密度：只往 <html> 上写 data-*，具体样式在 style.css。
// 跟随系统时还要监听 prefers-color-scheme，所以生命周期也收在这里。
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { setConfig } from '../api'
import { normalizeAccent, normalizeDensity } from '../lib/prefs.mjs'

export function useAppearance(config) {
  const isDark = ref(true)
  let mediaQuery = null

  function applyAppearance() {
    const theme = config.value.theme || 'system'
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const dark = theme === 'dark' || (theme === 'system' && sysDark)
    const root = document.documentElement
    root.dataset.theme = dark ? 'dark' : 'light'
    root.dataset.size = config.value.fontSize || 'm'
    root.dataset.accent = normalizeAccent(config.value.accent)
    root.dataset.density = normalizeDensity(config.value.density)
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
    () => [config.value.theme, config.value.fontSize, config.value.accent, config.value.density],
    () => applyAppearance()
  )

  onMounted(() => {
    // 第一次 applyAppearance 由 App.vue 在 getConfig() 回来后调用，
    // 这里只负责跟随系统的监听，避免先闪一下默认主题。
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', applyAppearance)
  })

  onBeforeUnmount(() => {
    if (mediaQuery) mediaQuery.removeEventListener('change', applyAppearance)
  })

  return { isDark, applyAppearance, toggleTheme }
}
