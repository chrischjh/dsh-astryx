const MAX_BODY_BYTES = 64 * 1024
const DEADLINE_MS = 60_000
const ROUTE_PATH = '/dsh-astryx'

/**
 * Same-origin JSON routes behind the detail-page buttons. Read-only by design:
 * every route runs one of the read-only report services and writes nothing to
 * the profile. POST-only, JSON-only, Origin must match Host.
 */
export function createRoutes(options) {
  return {
    kind: 'prefix',
    path: ROUTE_PATH,
    handler: (req, res) => handleRequest(req, res, options),
  }
}

export async function handleRequest(req, res, { status, setup, selfCheck, log = () => {}, now = () => new Date() }) {
  const send = (code, payload) => {
    const body = JSON.stringify(payload)
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  }
  const fail = (code, reason, message) => send(code, { ok: false, checkedAt: now().toISOString(), failure: { code: reason, message } })

  if (req.method !== 'POST') return fail(405, 'method-not-allowed', 'POST only')
  const origin = String(req.headers?.origin ?? '')
  const host = String(req.headers?.host ?? '')
  if (host === '' || (origin !== `http://${host}` && origin !== `https://${host}`)) {
    return fail(403, 'cross-origin', 'same-origin requests only')
  }
  const contentType = String(req.headers?.['content-type'] ?? '')
  if (!contentType.toLowerCase().includes('application/json')) return fail(415, 'unsupported-media-type', 'application/json required')

  const action = String(req.url ?? '').replace(ROUTE_PATH, '').replace(/\/+$/, '')
  if (!['/status', '/setup', '/selfcheck'].includes(action)) return fail(404, 'unknown-action', `no route for "${action}"`)

  let body = {}
  try {
    body = (await readJsonBody(req)) ?? {}
  } catch (error) {
    return fail(400, 'bad-body', String(error?.message ?? error))
  }
  const projectPath = typeof body.projectPath === 'string' && body.projectPath ? body.projectPath : undefined

  try {
    const report = await withDeadline(DEADLINE_MS, () => dispatch(action, { status, setup, selfCheck, projectPath }))
    return send(200, { ok: true, checkedAt: now().toISOString(), action: action.slice(1), report })
  } catch (error) {
    log(`route ${action} failed: ${String(error?.message ?? error)}`)
    return fail(500, 'internal', String(error?.message ?? error))
  }
}

async function dispatch(action, { status, setup, selfCheck, projectPath }) {
  if (action === '/status') return await status.collect({ projectPath, refresh: true })
  if (action === '/setup') return setup.run({ projectPath })
  return await selfCheck.run({ projectPath })
}

function withDeadline(ms, task) {
  return Promise.race([
    task(),
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
      timer.unref?.()
    }),
  ])
}

async function readJsonBody(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  return JSON.parse(text)
}
