const { protocol, net } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { pathToFileURL } = require('url')

const SCHEME = 'tv-asset'
const NAME_RE = /^[a-z0-9]+\.(png|jpg|jpeg|gif|webp)$/i

/** 必须在 app ready 之前调用 */
function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

function safeName(name) {
  const base = path.basename(String(name || ''))
  return NAME_RE.test(base) ? base : null
}

/** ready 之后调用，dirFn 返回图片存放目录 */
function handle(dirFn) {
  protocol.handle(SCHEME, async (request) => {
    // standard 协议会把 tv-asset://a.png 解析成 host=a.png / path=/，
    // 所以两种形式都要兼容
    const url = new URL(request.url)
    const candidates = [url.hostname].concat(url.pathname.split('/').filter(Boolean))
    const name = candidates.map((c) => safeName(decodeURIComponent(c))).find(Boolean)
    if (!name) return new Response('bad asset', { status: 400 })
    const file = path.join(dirFn(), name)
    if (!fs.existsSync(file)) return new Response('not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

function save(dir, buffer, ext = 'png') {
  // 只收协议白名单里的格式，否则写进去也读不出来（会变成坏图）
  const clean = String(ext || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
  if (!ALLOWED_EXT.has(clean)) {
    return { ok: false, error: '不支持的图片格式：' + (ext || '未知') }
  }
  try {
    const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16)
    const name = hash + '.' + clean
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, name)
    if (!fs.existsSync(file)) fs.writeFileSync(file, buffer)
    return { ok: true, url: `${SCHEME}://${name}`, name, size: buffer.length }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

module.exports = { SCHEME, registerScheme, handle, save, safeName }
