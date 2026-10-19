// ESLint 扁平配置。
//
// 目标不是统一风格（那件事交给格式化工具），而是拦住会变成 bug 的写法：
// 未使用变量、未定义标识符、拼错的指令。所以只用 essential 级别，
// 不引 strongly-recommended（那套规则大量涉及缩进与换行）。
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  {
    ignores: ['dist/**', 'release/**', 'release-*/**', 'node_modules/**', '.workbuddy/**']
  },

  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],

  // 主进程与脚本：CommonJS
  {
    files: ['electron/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node }
    }
  },

  // 以 .mjs 结尾的一律是 ESM（vite 配置、开发脚本、渲染层的展示逻辑）
  {
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node }
    }
  },

  // 渲染层：ESM + 浏览器全局（覆盖上一条里的 node 全局不冲突，这里再叠一层）
  {
    files: ['src/**/*.js', 'src/**/*.mjs', 'src/**/*.vue'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.browser }
    }
  },

  {
    rules: {
      // 允许 _ 开头的占位参数，比如 IPC handler 的 (_e, payload)
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      // catch (_) {} 是本项目里刻意的「吞掉失败」，不算空块
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 导出文案里的全角空格是有意的（「导出时间：... 共 N 条」）
      'no-irregular-whitespace': ['error', { skipTemplates: true }],
      // 单文件组件名不必多词
      'vue/multi-word-component-names': 'off',
      // 规则只记「最近一个 v-for 祖先」，遇到「外层 template v-for + 内层
      // article v-for + 同元素 v-memo」会误报（App.vue 的实际写法是官方支持的）
      'vue/valid-v-memo': 'off'
    }
  }
]
