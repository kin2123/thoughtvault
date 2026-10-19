/**
 * 图片资源引用扫描（只读）。
 *
 * 背景：删除笔记不会删 assets/ 里的图片文件，而图片是内容哈希命名的，
 * 没法靠文件名反推归属。所以先做「哪些文件没有任何笔记引用」的报表，
 * 由人来决定要不要清理——**这里不做任何删除**。
 *
 * 引用来源包括回收站里的笔记：软删的笔记还能恢复，它引用的图片不能算孤儿。
 */

// 与 assets.js 的 SCHEME / NAME_RE 保持一致
const REF_RE = /tv-asset:\/\/([a-z0-9]+\.(?:png|jpg|jpeg|gif|webp))/gi

/** 从一段正文里提取引用的文件名（统一小写） */
function extractRefs(text, into = new Set()) {
  const s = String(text == null ? '' : text)
  REF_RE.lastIndex = 0
  let m
  while ((m = REF_RE.exec(s))) into.add(m[1].toLowerCase())
  return into
}

/**
 * @param {string[]} files  assets 目录下的文件名
 * @param {Set<string>} refs 所有笔记引用到的文件名（小写）
 * @returns {{ orphans: string[], referenced: string[] }}
 */
function findOrphans(files, refs) {
  const orphans = []
  const referenced = []
  for (const f of files) {
    if (refs.has(String(f).toLowerCase())) referenced.push(f)
    else orphans.push(f)
  }
  return { orphans, referenced }
}

module.exports = { extractRefs, findOrphans, REF_RE }
