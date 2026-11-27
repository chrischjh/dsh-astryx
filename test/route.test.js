import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest } from '../src/route.js'

function makeReq({ method = 'POST', url = '/dsh-astryx/setup', headers = {}, body = '{}' } = {}) {
  const req = {
    method,
    url,
    headers: { host: '127.0.0.1:5000', origin: 'http://127.0.0.1:5000', 'content-type': 'application/json', ...headers },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(body)
    },
  }
  return req
}

function makeRes() {
  const out = { code: undefined, headers: undefined, body: '' }
  return {
    out,
    writeHead(code, headers) {
      out.code = code
      out.headers = headers
    },
    end(body) {
      out.body = String(body ?? '')
    },
  }
}

function services() {
  return {
    status: { collect: async () => ({ compat: { verdict: 'compatible' } }) },
    setup: { run: () => ({ ready: true, checks: [] }) },
    selfCheck: { run: async () => ({ ok: true }) },
  }
}

async function call(options) {
  const res = makeRes()
  await handleRequest(makeReq(options), res, { ...services(), now: () => new Date('2026-11-27T00:00:00Z') })
  return { code: res.out.code, payload: res.out.body ? JSON.parse(res.out.body) : undefined }
}

test('POST from the same origin runs the requested report', async () => {
  const { code, payload } = await call({ url: '/dsh-astryx/setup' })
  assert.equal(code, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.action, 'setup')
  assert.deepEqual(payload.report, { ready: true, checks: [] })
})

test('every action is dispatchable', async () => {
  for (const [action, check] of [['status', (r) => r.compat.verdict === 'compatible'], ['selfcheck', (r) => r.ok === true]]) {
    const { code, payload } = await call({ url: `/dsh-astryx/${action}` })
    assert.equal(code, 200)
    assert.ok(check(payload.report), action)
  }
})

test('non-POST is refused before anything else', async () => {
  const { code, payload } = await call({ method: 'GET' })
  assert.equal(code, 405)
  assert.equal(payload.failure.code, 'method-not-allowed')
})

test('a cross-origin request is refused', async () => {
  const { code, payload } = await call({ headers: { origin: 'https://evil.example' } })
  assert.equal(code, 403)
  assert.equal(payload.failure.code, 'cross-origin')
})

test('a non-JSON body is refused', async () => {
  const { code, payload } = await call({ headers: { 'content-type': 'text/plain' } })
  assert.equal(code, 415)
  assert.equal(payload.failure.code, 'unsupported-media-type')
})

test('an unknown action is a 404, not a crash', async () => {
  const { code, payload } = await call({ url: '/dsh-astryx/nope' })
  assert.equal(code, 404)
  assert.equal(payload.failure.code, 'unknown-action')
})

test('an oversized body is refused', async () => {
  const big = `{"pad":"${'x'.repeat(70 * 1024)}"}`
  const { code, payload } = await call({ body: big })
  assert.equal(code, 400)
  assert.equal(payload.failure.code, 'bad-body')
})

test('a service failure becomes a structured 500', async () => {
  const res = makeRes()
  const failing = {
    status: { collect: async () => { throw new Error('registry down') } },
    setup: { run: () => ({}) },
    selfCheck: { run: async () => ({}) },
  }
  await handleRequest(makeReq({ url: '/dsh-astryx/status' }), res, failing)
  assert.equal(res.out.code, 500)
  assert.equal(JSON.parse(res.out.body).failure.code, 'internal')
})
