import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { McpProbe } from '../src/mcpProbe.js'

/** A child process stand-in whose stdin records requests and whose stdout answers tools/list. */
function fakeChild({ tools = ['search', 'component'], exitCode = null, exitBeforeAnswer = false } = {}) {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  const requests = []
  child.stdin = {
    write(payload) {
      const message = JSON.parse(payload)
      requests.push(message)
      if (message.id === 2) {
        setImmediate(() => {
          if (exitBeforeAnswer) {
            child.emit('close', exitCode ?? 1)
            return
          }
          const answer = { jsonrpc: '2.0', id: 2, result: { tools: tools.map((name) => ({ name })) } }
          child.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'astryx' } } })}\n`)
          child.stdout.emit('data', `${JSON.stringify(answer)}\n`)
        })
      }
    },
    end() {},
  }
  child.kill = () => {}
  return { child, requests }
}

test('handshake reports the tool list', async () => {
  const { child, requests } = fakeChild()
  const probe = new McpProbe({ spawnImpl: () => child })
  const result = await probe.probe({ command: 'astryx', args: ['mcp'], retries: 0 })
  assert.equal(result.ok, true)
  assert.deepEqual(result.tools, ['search', 'component'])
  assert.equal(requests[0].method, 'initialize')
  assert.equal(requests[2].method, 'tools/list')
})

test('a server that exits before answering is unreachable, not healthy', async () => {
  const { child } = fakeChild({ exitBeforeAnswer: true })
  const probe = new McpProbe({ spawnImpl: () => child })
  const result = await probe.probe({ command: 'astryx', args: ['mcp'], retries: 0 })
  assert.equal(result.ok, false)
  assert.match(result.error, /before tools\/list/)
})

test('retries then gives up with the last error', async () => {
  let attempts = 0
  const probe = new McpProbe({
    spawnImpl: () => {
      attempts += 1
      return fakeChild({ exitBeforeAnswer: true, exitCode: 2 }).child
    },
  })
  const result = await probe.probe({ command: 'astryx', args: ['mcp'], retries: 1, timeoutMs: 5000 })
  assert.equal(result.ok, false)
  assert.equal(attempts, 2)
  assert.match(result.error, /exited \(2\)/)
})

test('a spawn failure is reported, not thrown', async () => {
  const probe = new McpProbe({ spawnImpl: () => { throw new Error('ENOENT') } })
  const result = await probe.probe({ command: 'missing', retries: 0 })
  assert.equal(result.ok, false)
  assert.match(result.error, /ENOENT/)
})

test('no command means no probe', async () => {
  const probe = new McpProbe()
  const result = await probe.probe({})
  assert.equal(result.ok, false)
  assert.equal(result.error, 'no command to probe')
})
