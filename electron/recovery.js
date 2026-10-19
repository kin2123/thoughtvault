/**
 * 渲染进程崩溃后的自动重载闸门。
 *
 * 窗口是无边框 + 无菜单栏的：渲染进程一崩就是纯白屏，
 * 用户既没有刷新按钮也没有菜单，只能杀进程重开。
 * 所以崩了要自动 reload，但必须限流——否则一个必崩的 bug 会变成无限重载。
 */
function createReloadGate({ windowMs = 60000, maxReloads = 2 } = {}) {
  let times = []
  return function shouldReload(now = Date.now()) {
    times = times.filter((t) => now - t < windowMs)
    if (times.length >= maxReloads) return false
    times.push(now)
    return true
  }
}

module.exports = { createReloadGate }
