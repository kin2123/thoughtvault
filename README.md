# 此项目完全使用ai制作

# 思库 ThoughtVault

本地优先的轻量速记工具。全局快捷键随时叫出，敲完就存，数据只留在自己机器上。

## 现在能用的

**记录**

- **全局快捷键**：`Ctrl + Shift + Space` 在任何界面唤出 / 收起窗口，快捷键可在设置里改
- **秒记**：`Enter` 保存，`Shift + Enter` 换行，`Esc` 收起
- **Markdown**：粗体、列表、代码块、引用、表格、链接都渲染，编辑时仍是纯文本
- **粘贴图片**：`Ctrl + V` 直接把图存到本地 `assets/`，正文插引用
- **草稿保护**：没按回车就关窗口，下次打开内容还在
- **#标签**：正文里写 `#开发` 自动识别成标签，顶部按标签筛选
- **搜索**：`Ctrl + K` 聚焦搜索框，走 SQLite FTS5 倒排索引，中文单字也能搜（「学」能搜到「学习」）
- **排序**：最近更新 / 最新创建 / 篇幅最长，一键切换
- **时间分组**：按天分节，标题吸顶；超过 7 天的分组默认收起，点标题展开
- **键盘流**：`↑` `↓` 在列表里上下选，`Enter` 直接进编辑，手不用离开键盘
- **置顶 / 编辑**：双击正文直接改，`Ctrl + Enter` 保存，`Esc` 取消

**批量与整理**

- **多选**：进多选模式勾选，支持批量删除、批量打标签（`Ctrl + A` 全选）
- **标签管理**：改名、合并、删除；改名会同步改写正文里的 `#旧名`，不会因为下次编辑又变回去

**不怕丢**

- **回收站**：删除先进回收站，可恢复；30 天后自动清理
- **撤销**：删完 6 秒内底部弹「撤销」，一键找回
- **自动备份**：每次启动自动备份一份 `.db`，最多保留最近 7 份
- **导出**：单次全量导出 Markdown 或 JSON
- **导入**：从 JSON 合并进来，按 id 去重，重复的自动跳过

**界面与系统**

- **主题**：标题栏一键切换亮/暗；设置里可选深色 / 浅色 / 跟随系统
- **字号**：小 / 中 / 大三档
- **分页加载**：列表按 80 条一页滚动加载，上千条也不卡
- **托盘常驻**：关窗口不退出；托盘里能新建、开设置、开回收站、立即备份
- **窗口记忆**：记住位置和尺寸，换显示器跑出屏幕外会自动回到主屏
- **开机自启**：设置里可开（打包安装后生效）
- **失焦自动收起**：可在设置里关掉
- **首次引导**：第一次打开有一页操作说明
- **设置面板**：`Ctrl + ,` 打开
- **数据位置可换**：设置里「更改…」选任意目录，笔记、图片、备份、草稿一起搬过去；原位置的数据保留不删

## 数据放在哪

默认在 `%APPDATA%\思库\`，可以在设置里改到任意目录（比如 D 盘或同步盘）：

```
notes.db       全部笔记（SQLite + WAL），回收站也在里面（deleted_at 字段）
assets/        粘贴进来的图片，正文用 ![](tv-asset://文件名) 引用
draft.json     未提交的草稿
backups/       自动备份，保留最近 7 份 .db
logs/app.log   异常日志
```

`config.json` 例外，它永远留在 `%APPDATA%\思库\`——它是「指针」，记着数据被指到了哪。

换位置的规则：

| 情况 | 行为 |
|---|---|
| 目标目录是空的 | 复制现有数据过去，切换；**原位置保留**，想回退随时能回 |
| 目标目录已有 `notes.db` | 弹窗确认，选「使用该目录的数据」才切过去，不覆盖任何一边 |
| 用户取消 / 目录不可写 | 中止，当前数据不动 |
| 新位置打不开 | 自动回滚到原位置并保留数据库可写，报错提示 |

图片走自定义协议 `tv-asset://`，只放行 `assets/` 目录里白名单后缀的文件，不会变成任意文件读取。

旧版 `notes.json` 会在首次启动时自动迁移进数据库，源文件改名为 `notes.json.migrated-时间戳` 留档。

## 为什么是 SQLite

| | 之前（JSON 全量重写） | 现在（SQLite） |
|---|---|---|
| 改一条笔记 | 序列化整个数组、整文件覆盖 | 一行 UPDATE，O(1) |
| 5000 条时保存 | ~300ms，输入掉帧 | ~1ms |
| 中文搜索 | 全表 `includes()` 扫描 | FTS5 倒排索引 |
| 排序分页 | 内存里全量重排 | 复合索引 + LIMIT |
| 并发写入 | 后写的整个覆盖前面的 | 事务 + WAL |

**中文分词有个坑**：FTS5 的 `unicode61` 把连续汉字当成一个 token，搜「学习」搜不到「今天学习」。这里的做法是写入和查询时都给每个汉字前后插空格，让每字独立成 token，查询用短语匹配 —— 见 `electron/db.js` 的 `segment()`。

## 怎么跑

```bash
npm install

# 桌面版（先构建前端再启动 Electron）
npm run app

# 开发模式：终端 A 跑前端，终端 B 启动外壳，改代码即时生效
npm run dev
npm run dev:app

# 只在浏览器里看界面（不需要 Electron，数据存 localStorage）
npm run dev

# 打包 Windows 安装包 + 免安装版（产物在 release/）
npm run dist

# 自检
npm run test:db      # 数据库层 30 项断言
npm run test:groups  # 时间分组 + 键盘导航 11 项断言
npm run test:paging  # 分页加载 7 项断言（灌 300 条实测）
npm run test:batch   # 多选批量删除 5 项断言
npm run test:datadir # 数据目录搬迁 17 项断言
npm run test:edge    # 边界与攻击：注入/XSS/超长/畸形导入 14 项
npm run test:edge2   # 连续操作/空态/批量标签/图片类型 10 项
npm run smoke        # 界面端到端 13 项断言 + 五张截图
npm run bench        # 数据库层基准（导入 2000 条后逐项计时 + 查询计划）
npm run bench:ui     # 界面渲染基准（首屏 / 切筛选 / 切排序 / 续载）
```

### 原生模块注意

`better-sqlite3` 是原生模块，必须和 Electron 的 ABI 对齐。仓库里已经有一份编译好的 `build/Release/better_sqlite3.node`（Electron 33 / win32-x64），所以 `npm install` 之后一般能直接用。

如果 `node_modules` 被整个删掉重装，需要本机具备：

- **Python ≤ 3.11**（3.12 起移除了 `distutils`，node-gyp 会报 `No module named 'distutils'`）
- **Visual Studio Build Tools**（C++ 工作负载）

然后：

```bash
npm_config_python="你的python3.11路径/python.exe" npx electron-rebuild -f -w better-sqlite3
```

打包时 `npmRebuild: false`，直接复用这份二进制，不需要每次编译。

## 界面

按「排版 40% + 间距 25% = 65% 观感」的思路重做过一版令牌：

| 层 | 做法 |
|---|---|
| 间距 | 4px 栅格（`--s1`~`--s6`），组件里不再出现 14px / 9px 这种随手值 |
| 字号 | 1.22 比例，正文 14.5px（原来 13.5 偏小），说明文字统一 11.5px |
| 配色 | 深色靠**明度分层**（surface 0/1/2/3）而不是阴影；浅色用轻边框 + 白卡 |
| 对比度 | 次要文字提到 ≥4.5:1（原来的 `#5f5f6e` 只有 2.8:1，小字读不清） |
| 细节 | 焦点环只在键盘操作时出现（`:focus-visible`）、时间用等宽数字、卡片 hover 只在深色下提亮 |

两个主题共用同一套语义变量，切换只是给 `<html>` 换 `data-theme`，没有两份样式。

## 体积

| | 之前 | 现在 |
|---|---|---|
| 安装包 / 免安装 exe | 83 MB | **72 MB** |
| 解包后 | 298 MB | **231 MB** |
| `app.asar` | 18 MB | **304 KB** |
| `locales` | 41 MB | **1.6 MB** |

三处改动：

1. **只保留中文和英文语言包**（`electronLanguages`）。Electron 默认带 50 多个 `.pak`，占 41 MB，实际只用得到一个。
2. **`node_modules` 只打运行时需要的东西**。原来 `vue` 把 `@vue/compiler-sfc` → `@babel/*` 一整串编译期依赖拖进了 asar，18 MB 里大部分是运行时根本不会 `require` 的代码。现在只留 `better-sqlite3` 的 `lib` + `.node`、`bindings`、`file-uri-to-path`。
3. **`compression: maximum`**。

剩下的 231 MB 里，`思库.exe`（Chromium + Node）就占 181 MB，加上 `icudtl.dat` 10 MB、Chromium 许可文件 8.8 MB、GPU 相关 DLL 18 MB——这些是 Electron 的固定成本，除非自己编译裁剪过的 Electron，或者换 Tauri，否则压不下去。

## 性能

两个层面都做了实测（`npm run bench` / `npm run bench:ui`），数据基于 2000 条笔记：

| 操作 | 耗时 |
|---|---|
| 列表首屏 80 条 | 0.6 ms |
| 中文搜索「学习」 | 2.0 ms |
| 标签统计 | 1.1 ms |
| 标签 + 关键词组合 | 2.3 ms |
| 新建一条 | 3.6 ms |
| 标签改名（批量改正文 + 重建索引） | 1.6 ms |
| 界面切标签（500 条数据） | 9.5 ms |
| 界面切排序 | 10.3 ms |

结论：**瓶颈不在数据库，也不在渲染**——所以优化只做在该做的地方，不为了数字好看去折腾。

真正改掉的：

- **PRAGMA 补齐**：`busy_timeout=5000`（并发兜底）、`cache_size=-64000`（64MB 页缓存）、`temp_store=MEMORY`（临时表进内存）、`mmap_size`；关闭时 `PRAGMA optimize` 更新查询计划统计
- **补 `(deleted_at, pinned DESC, created_at DESC)` 复合索引**：按创建时间排序 0.63ms → 0.31ms，`EXPLAIN QUERY PLAN` 确认走索引
- **首屏合并成一次 IPC**（列表 + 标签 + 计数），省掉三次往返
- **回收站列表改成进视图才拉**，启动时不再白查一遍
- **`v-memo` 卡片**：只在内容 / 选中态变化时重新 patch，切标签 26ms → 9.5ms
- **备份改用 `VACUUM INTO`**：产出独立紧凑副本，不会在写入过程中拷到半截数据
- **批量导入后 `optimize` FTS**，合并碎掉的倒排索引段

已知边界：按字数排序必然走 `TEMP B-TREE`（`LENGTH()` 无法走索引），要消除得加冗余列，当前 1.1ms 不值得。

## 目录

```
electron/
  main.js       窗口、全局快捷键、托盘、单实例、IPC、导入导出对话框
  preload.js    contextBridge 暴露的最小接口
  db.js         SQLite：建表、FTS5 中文分词、CRUD、标签维护、批量操作、迁移、备份
  assets.js     图片落盘与 tv-asset 自定义协议
  store.js      草稿文件与目录管理
  config.js     设置持久化（含默认值合并与窗口位置校验）
src/
  App.vue       捕获框、列表、Markdown、多选、排序、主题、引导、Toast
  api.js        桌面 / 浏览器 双实现，接口一致
  style.css     深浅两套主题变量 + Markdown 排版
  components/
    SettingsPanel.vue  设置面板 + 快捷键录制
    TagManager.vue     标签改名 / 删除
    TrashView.vue      回收站
scripts/
  gen-icon.py   生成 build/icon.png（纯标准库，无依赖）
  ipc-stub.js   测试用 IPC 桩，四个测试脚本共用一份
  test-db.js    数据库层 30 项断言
  test-groups.js 时间分组 + 键盘导航 11 项断言
  test-paging.js 分页加载 7 项断言
  test-batch.js  多选批量删除 5 项断言
  test-datadir.js 数据目录搬迁 17 项断言
  test-edge.js   边界与攻击性测试 14 项
  test-edge2.js  连续操作与异常输入 10 项
  smoke.js      无头渲染 + 五张截图 + 13 项端到端断言
  bench.js      数据库层基准（2000 条）
  bench-ui.js   界面渲染基准
  dev-app.mjs   开发模式启动器
```

## 一点说明

- 硬件加速默认关闭（纯文本工具用不上，老显卡和虚拟机上更稳）。想打开设 `APP_GPU=1`。
- 数据格式是一个 JSON 文件，字段：`id / content / tags / createdAt / updatedAt / pinned`。换存储（比如 SQLite + FTS5）时只需要改 `electron/store.js`。
- 打包不能跨平台：Windows 只能出 exe，要 dmg 得在 macOS 上打。
