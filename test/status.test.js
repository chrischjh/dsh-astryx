import { test } from 'node:test'
import assert from 'assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Contract } from '../src/contract.js'
import { StatusService, formatStatus } from '../src/status.js'

const contract = Contract.load()
const NOW = new Date('2026-11-27T08:00:00Z')

function fakeProbe({ core = '0.7.17', cli = '0.7.17', commands = null } = {}) {
  return () => ({
    locate: () => ({ dir: '/tmp/project', found: true }),
    installed: () => ({ core, cli, source: 'node_modules' }),
    cliCandidates: () => [{ via: 'project-cli', file: 'node', args: ['bin.mjs', 'manifest', '--json'] }],
    runCli: async () => ({ ran: true, via: 'project-cli', version: cli, commands: commands ?? ['docs', 'search', 'component', 'template', 'manifest', 'init', 'swizzle', 'upgrade', 'doctor'], initFlags: '--to', missing: [], error: '' }),
  })
}

function fakeRegistry(latest = '0.7.17', ok = true) {
  return () => ({
    versions: async () => ({
      core: ok ? { latest, canary: '0.7.18-canary.1' } : null,
      cli: ok ? { latest } : null,
      ok,
      error: ok ? '' : 'registry answered 503',
    }),
  })
}

function service({ latest, ok, probe, cacheDir, now = NOW } = {}) {
  return new StatusService({
    contract,
    config: { ttlHours: 6, registry: 'https://registry.npmjs.org' },
    cacheDir: cacheDir ?? '',
    makeRegistry: fakeRegistry(latest, ok),
    makeProbe: probe ?? fakeProbe(),
    now: () => now,
  })
}

test('no update flag when nothing is installed', async () => {
  const probe = () => ({
    locate: () => ({ dir: '/tmp/project', found: false }),
    installed: () => ({ core: '', cli: '', source: 'none' }),
    cliCandidates: () => [],
  })
  const status = await service({ latest: '0.7.18', probe }).collect({})
  assert.equal(status.astryx.updateAvailable, false)
  assert.equal(status.compat.verdict, 'compatible-untested')
})

test('reports installed vs latest and a verdict', async () => {
  const status = await service({ latest: '0.7.18', probe: fakeProbe() }).collect({ projectPath: '/tmp/project' })
  assert.equal(status.astryx.installedCore, '0.7.17')
  assert.equal(status.astryx.latestCore, '0.7.18')
  assert.equal(status.astryx.updateAvailable, true)
  assert.equal(status.compat.verdict, 'compatible-untested')
  assert.equal(status.probe.ran, true)
  assert.equal(status.registry.ok, true)
})

test('a missing required command makes the plugin incompatible', async () => {
  const status = await service({ latest: '0.7.17', probe: fakeProbe({ commands: ['docs'] }) }).collect({})
  assert.equal(status.compat.verdict, 'capability-incompatible')
  assert.ok(status.probe.missing.includes('command:manifest'))
})

test('registry failure still produces a verdict from the installed version', async () => {
  const status = await service({ ok: false }).collect({})
  assert.equal(status.registry.ok, false)
  assert.equal(status.compat.verdict, 'compatible')
  assert.equal(status.compat.judgedAgainst, '0.7.17')
})

test('cache serves the second call and refresh bypasses it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-astryx-status-'))
  const cached = service({ latest: '0.7.18', cacheDir: dir })
  const first = await cached.collect({ projectPath: '/tmp/project' })
  assert.equal(first.fromCache, false)
  const second = await cached.collect({ projectPath: '/tmp/project' })
  assert.equal(second.fromCache, true)
  const refreshed = await cached.collect({ projectPath: '/tmp/project', refresh: true })
  assert.equal(refreshed.fromCache, false)
})

test('a stale cache entry is ignored', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-astryx-stale-'))
  const old = new StatusService({
    contract,
    config: { ttlHours: 1, registry: 'https://registry.npmjs.org' },
    cacheDir: dir,
    makeRegistry: fakeRegistry('0.7.18'),
    makeProbe: fakeProbe(),
    now: () => new Date('2026-11-27T00:00:00Z'),
  })
  await old.collect({})
  const fresh = service({ latest: '0.7.18', cacheDir: dir })
  const result = await fresh.collect({})
  assert.equal(result.fromCache, false)
})

test('formatStatus prints one screen of facts', async () => {
  const status = await service({ latest: '0.7.18' }).collect({})
  const text = formatStatus(status)
  assert.match(text, /installed: core 0.7.17/)
  assert.match(text, /latest: core 0.7.18/)
  assert.match(text, /compat: compatible-untested/)
})
