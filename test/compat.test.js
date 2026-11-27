import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Contract } from '../src/contract.js'
import { CompatJudge } from '../src/compat.js'

const contract = Contract.load()

test('contract declares a support range and a tested version', () => {
  assert.equal(contract.supports('core', '0.7.17'), true)
  assert.equal(contract.supports('core', '0.8.0'), true)
  assert.equal(contract.supports('core', '0.9.0'), false)
  assert.equal(contract.tested('core'), '0.7.17')
  assert.ok(contract.requiredCommands.includes('manifest'))
})

const judge = new CompatJudge(contract)

test('compatible when the newest release is the tested one', () => {
  const result = judge.judge({ latest: { core: '0.7.17' }, installed: { core: '0.7.17', source: 'node_modules' }, registryOk: true })
  assert.equal(result.verdict, 'compatible')
  assert.equal(result.target, '0.7.17')
})

test('compatible-untested when newer but inside the range', () => {
  const result = judge.judge({ latest: { core: '0.7.18' }, installed: { core: '0.7.18', source: 'node_modules' } })
  assert.equal(result.verdict, 'compatible-untested')
  assert.match(result.reasons.join(' '), /newer than the tested/)
})

test('plugin-update-required when the newest release leaves the range', () => {
  const result = judge.judge({ latest: { core: '0.9.0' }, installed: { core: '0.7.17', source: 'node_modules' } })
  assert.equal(result.verdict, 'plugin-update-required')
  assert.match(result.reasons.join(' '), /outside the range/)
  assert.ok(result.actions.length > 0)
})

test('astryx-too-old when the release is below the minimum', () => {
  const result = judge.judge({ latest: { core: '0.6.5' }, installed: { core: '0.6.5', source: 'node_modules' } })
  assert.equal(result.verdict, 'astryx-too-old')
})

test('capability-incompatible outranks every version comparison', () => {
  const result = judge.judge({
    latest: { core: '0.7.17' },
    installed: { core: '0.7.17', source: 'node_modules' },
    probe: { ran: true, via: 'project-cli', version: '0.7.17', commands: [], initFlags: '', missing: ['command:swizzle'] },
  })
  assert.equal(result.verdict, 'capability-incompatible')
  assert.match(result.reasons.join(' '), /swizzle/)
})

test('unknown when the registry is unreachable and nothing is installed', () => {
  const result = judge.judge({ latest: {}, installed: { core: '', cli: '', source: 'none' }, registryOk: false })
  assert.equal(result.verdict, 'unknown')
})

test('judges the installed version when the registry is unreachable', () => {
  const result = judge.judge({ latest: {}, installed: { core: '0.8.0', source: 'node_modules' }, registryOk: false })
  assert.equal(result.verdict, 'compatible-untested')
  assert.equal(result.target, '0.8.0')
})
