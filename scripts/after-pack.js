'use strict'
// electron-builder 的 afterPack 钩子：打包完成、压缩成安装包之前，删掉用不到的运行时文件。
// 在 package.json 的 build 段配置 "afterPack": "scripts/after-pack.js"。
//
// 说明：以下三项删掉后应用仍能正常启动（思库不播放音视频、不用 WebGL / canvas）。
// 其中 LICENSES.chromium.html 是 Chromium 的第三方许可声明，删掉体积收益最大（8.7MB），
// 但严格来说分发 Chromium 二进制应附带它。要合规就把它从 DROP 里移除，
// 或在「关于」页面里放一份链接。

const fs = require('fs')
const path = require('path')

const DROP = [
  'LICENSES.chromium.html', // 8.7 MB  Chromium 第三方许可文本，运行时不读取
  'vk_swiftshader.dll',     // 5.3 MB  Vulkan 软件渲染后端，无 GPU 时的兜底
  'vk_swiftshader_icd.json', //       vk_swiftshader 的配套清单
  'ffmpeg.dll'              // 2.8 MB  音视频编解码；src/ 中无 video/audio/WebRTC。
                            //         ⚠️ 将来若做语音录音或音频播放，必须把它从这里移除
]

module.exports = async function afterPack (context) {
  if (context.electronPlatformName !== 'win32') return

  const dir = context.appOutDir
  let freed = 0

  for (const name of DROP) {
    const file = path.join(dir, name)
    let stat
    try {
      stat = fs.statSync(file)
    } catch (err) {
      continue // 已删除或不存在，多 target 打包时会重复进来，忽略
    }
    try {
      fs.unlinkSync(file)
      freed += stat.size
      console.log(`[after-pack] 删除 ${name}（${(stat.size / 1048576).toFixed(1)} MB）`)
    } catch (err) {
      // 删不掉就留着，不要因为瘦身把包搞坏
      console.warn(`[after-pack] 无法删除 ${name}，已保留：${err.message}`)
    }
  }

  console.log(`[after-pack] 共释放 ${(freed / 1048576).toFixed(1)} MB`)
}
