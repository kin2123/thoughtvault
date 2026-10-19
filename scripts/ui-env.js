/**
 * 界面测试的统一 Chromium 开关。
 *
 * 在没有可用 GPU 的环境（CI 容器、远程会话、部分虚拟机）里，
 * Electron 默认会起 GPU 进程，失败后直接
 * `GPU process isn't usable. Goodbye.` 退出 —— 连 did-fail-load 都走不到，
 * 表现成「file:// 加载失败」，很容易误判成 file 协议被拦。
 *
 * 这些开关强制走软件渲染，窗口照常创建、DOM 照常可用。
 */
function tune(app) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('disable-software-rasterizer')
  app.commandLine.appendSwitch('disable-dev-shm-usage')
}

module.exports = { tune }
