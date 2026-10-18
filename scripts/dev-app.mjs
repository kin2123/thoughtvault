// 开发模式：以 Electron 外壳加载 Vite dev server（需先另开一个终端跑 npm run dev）
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronBin = require('electron')

const url = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
const env = { ...process.env, VITE_DEV_SERVER_URL: url }
// WorkBuddy 等宿主环境可能注入该变量，会让 electron 退化成纯 node 运行
delete env.ELECTRON_RUN_AS_NODE

console.log('[dev-app] 加载', url)

const child = spawn(electronBin, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env })
child.on('exit', (code) => process.exit(code ?? 0))
