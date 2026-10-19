// 搜索高亮的切分逻辑：把一段文本按查询词切成「命中 / 未命中」片段。
// 纯函数，不碰 DOM —— DOM 那部分在 App.vue 里（需要真实渲染环境）。
//
// 多词查询与 FTS 的行为保持一致：空格分词，任一命中即高亮，
// 长词优先，避免「学习」被「学」拆成两段。

export function splitByQuery(text, raw) {
  const src = String(text == null ? '' : text)
  const terms = [...new Set(String(raw == null ? '' : raw).toLowerCase().split(/\s+/).filter(Boolean))]
  if (!terms.length) return [{ text: src, hit: false }]

  const lower = src.toLowerCase()
  const out = []
  let i = 0

  while (i < src.length) {
    let best = -1
    let bestLen = 0
    for (const t of terms) {
      const at = lower.indexOf(t, i)
      if (at === -1) continue
      if (best === -1 || at < best || (at === best && t.length > bestLen)) {
        best = at
        bestLen = t.length
      }
    }
    if (best === -1) break
    if (best > i) out.push({ text: src.slice(i, best), hit: false })
    out.push({ text: src.slice(best, best + bestLen), hit: true })
    i = best + bestLen
  }

  if (i < src.length) out.push({ text: src.slice(i), hit: false })
  return out.length ? out : [{ text: src, hit: false }]
}
