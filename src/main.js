import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

const app = createApp(App)

// 渲染层的兜底：组件里的未捕获异常、无人 await 的 Promise，
// 默认只会进 devtools 控制台。用户看到的是「按钮点了没反应」。
// 统一抛成事件，由 App.vue 转成一条 toast。
function report(err) {
  window.dispatchEvent(new CustomEvent('tv-error', { detail: err }))
}

app.config.errorHandler = (err) => report(err)
window.addEventListener('unhandledrejection', (e) => report(e.reason))

app.mount('#app')
