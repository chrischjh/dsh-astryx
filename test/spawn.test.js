import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needsShell, planSpawn, quoteForShell } from '../src/spawn.js'

test('only Windows command shims need a shell', () => {
  assert.equal(needsShell('C:\\npm\\astryx.cmd', 'win32'), true)
  assert.equal(needsShell('C:\\npm\\astryx.BAT', 'win32'), true)
  assert.equal(needsShell('/usr/local/bin/astryx', 'linux'), false)
  assert.equal(needsShell('/usr/local/bin/astryx', 'win32'), false)
  assert.equal(needsShell('C:\\node\\node.exe', 'win32'), false)
})

test('shell plans quote arguments and drop the raw arg list', () => {
  const plan = planSpawn({
    file: 'C:\\Program Files\\npm\\astryx.cmd',
    args: ['manifest', '--json', 'path with spaces'],
    platform: 'win32',
  })
  assert.equal(plan.options.shell, true)
  assert.deepEqual(plan.args, [])
  assert.ok(plan.file.startsWith('"C:\\Program Files\\npm\\astryx.cmd"'))
  assert.ok(plan.file.endsWith('"path with spaces"'))
})

test('non-shim plans stay untouched', () => {
  const plan = planSpawn({ file: 'astryx', args: ['manifest', '--json'], platform: 'linux' })
  assert.equal(plan.options.shell, undefined)
  assert.deepEqual(plan.args, ['manifest', '--json'])
})

test('quoteForShell leaves simple tokens alone', () => {
  assert.equal(quoteForShell('--json'), '--json')
  assert.equal(quoteForShell('a b'), '"a b"')
  assert.equal(quoteForShell('a&b'), '"a&b"')
})
