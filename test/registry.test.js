import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RegistryClient } from '../src/registry.js'

test('reads dist-tags for both packages', async () => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    assert.match(url, /\/-\/package\/%40astryxdesign%2F/)
    return { ok: true, json: async () => ({ latest: '0.7.17', canary: '0.7.18-canary.1' }) }
  }
  const client = new RegistryClient({ fetchImpl })
  const result = await client.versions()
  assert.equal(result.ok, true)
  assert.equal(result.core.latest, '0.7.17')
  assert.equal(result.cli.canary, '0.7.18-canary.1')
  assert.equal(calls.length, 2)
})

test('keeps a failure as data, not a thrown error', async () => {
  const client = new RegistryClient({
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  })
  const result = await client.versions()
  assert.equal(result.ok, false)
  assert.match(result.error, /503/)
  assert.equal(result.core, null)
})

test('survives a throwing fetch', async () => {
  const client = new RegistryClient({ fetchImpl: async () => { throw new Error('ENOTFOUND') } })
  const result = await client.versions()
  assert.equal(result.ok, false)
  assert.match(result.error, /ENOTFOUND/)
})
