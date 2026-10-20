'use strict'
// electron-builder 的 afterPack 钩子：打包完成、压缩成安装包之前，删掉用不到的运行时文件。
// 在 package.json 的 build 段配置 "afterPack": "scripts/after-pack.js"。
//
// ⚠️ 2026-10-20 修正：之前这里还删了 ffmpeg.dll / vk_swiftshader.dll / vk_swiftshader_icd.json，
//    注释写着「删掉后应用仍能正常启动」，是错的。
//    实测（release-0.9.5）：删掉 ffmpeg.dll 后双击 exe 直接退出，ExitCode = -1073741515
//    （0xC0000135 STATUS_DLL_NOT_FOUND）——Electron 33 的 exe 是动态依赖 ffmpeg.dll 的，
//    不是「不播放音视频就用不到」。补回该 dll 后立刻能启动。
//    vk_swiftshader.dll 是「无 GPU 时的软件渲染兜底」，这台机器本就有 GPU 进程起不来的历史问题，
//    删掉等于抽掉最后一道保险（代价 5.3 MB，不值）。
//    所以现在只保留 LICENSES.chromium.html 一项，其余全部保留。
//
// LICENSES.chromium.html 是 Chromium 的第三方许可声明，删掉体积收益最大（8.7 MB）。
// 严格来说分发 Chromium 二进制应附带它，要合规就把它从 DROP 里移除，或在「关于」页面放一份链接。

const fs = require('fs')
const path = require('path')

const DROP = [
  'LICENSES.chromium.html' // 8.7 MB  Chromium 第三方许可文本，运行时不读取
  // 不要再往这里加：
  //   ffmpeg.dll            → exe 的硬依赖，删了起不来
  //   vk_swiftshader.dll    → 无 GPU 时的软件渲染兜底
  //   vk_swiftshader_icd.json
  //   *.pak / icudtl.dat    → 界面与 i18n 直接依赖
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
