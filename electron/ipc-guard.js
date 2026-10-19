/**
 * IPC 入参收敛。
 *
 * 渲染层是自己写的，正常情况下不会传坏值；但这些 handler 直接把参数交给
 * SQL 和内存分配，一旦渲染进程被注入（或将来接 CLI/插件），
 * 一个 `limit: 1e9` 就能把整库读进内存。这里做最小限度的形状检查。
 */

const SORTS = new Set(['updated', 'created', 'length'])
const MAX_LIMIT = 5000
const MAX_QUERY = 200
const MAX_TAG = 64
const MAX_IDS = 5000
const MAX_TAGS = 50

function listOpts(input) {
  const o = input && typeof input === 'object' ? input : {}

  let limit = Number(o.limit)
  if (!Number.isFinite(limit) || limit <= 0) limit = 500
  limit = Math.min(Math.floor(limit), MAX_LIMIT)

  return {
    query: typeof o.query === 'string' ? o.query.slice(0, MAX_QUERY) : '',
    tag: typeof o.tag === 'string' ? o.tag.slice(0, MAX_TAG) : '',
    sort: SORTS.has(o.sort) ? o.sort : 'updated',
    limit,
    // 只有显式 false 才跳过标签统计，其他值一律按 true 处理
    withTags: o.withTags !== false
  }
}

function idList(input) {
  if (!Array.isArray(input)) return []
  const out = []
  for (const x of input) {
    if (typeof x === 'string' && x) out.push(x)
    if (out.length >= MAX_IDS) break
  }
  return out
}

function tagList(input) {
  if (!Array.isArray(input)) return []
  const out = []
  for (const x of input) {
    if (typeof x !== 'string') continue
    const t = x.trim()
    if (!t) continue
    out.push(t.slice(0, MAX_TAG))
    if (out.length >= MAX_TAGS) break
  }
  return out
}

module.exports = { listOpts, idList, tagList, MAX_LIMIT, MAX_IDS, MAX_TAGS }
