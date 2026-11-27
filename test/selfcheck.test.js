import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SelfCheck } from '../src/selfcheck.js'
import { Contract } from '../src/contract.js'

const contract = Contract.load()
const FULL_COMMANDS = ['docs', 'search', 'component', 'template', 'manifest', 'init', 'swizzle', 'upgrade', 'doctor']

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-astryx-check-'))
  for (const [path, content] of Object.entries(files)) {
    const target = join(dir, path)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }
  return dir
}

const VALID_SKILL = '---\nname: astryx\ndescription: Build UI with Astryx.\n---\n\n# Astryx\n'

function makeCheck({ patch = '', commands = FULL_COMMANDS, cli = true, mcpResult = null, skillRoot = null } = {}) {
  const root = skillRoot ?? tree({ 'skills/astryx/SKILL.md': VALID_SKILL })
  const patchFile = join(root, 'cordis.patch.yml')
  writeFileSync(patchFile, patch)
  const probe = () => ({
    locate: () => ({ dir: root, found: true }),
    installed: () => ({ core: '0.7.17', cli: cli ? '0.7.17' : '', source: 'node_modules' }),
    cliCandidates: () => (cli ? [{ via: 'project-cli', file: 'node', args: ['bin.mjs', 'manifest', '--json'] }] : []),
    runCli: async () => ({ ran: true, via: 'project-cli', version: '0.7.17', commands, initFlags: '--to', missing: [], error: '' }),
  })
  return new SelfCheck({
    contract,
    paths: {
      patchFiles: [patchFile],
      skills: join(root, 'skills'),
      agentsSkills: join(root, 'agents', 'skills'),
    },
    makeProbe: probe,
    makeMcp: () => ({ probe: async () => mcpResult ?? { ok: false, tools: [], latencyMs: 0, error: 'no probe configured' } }),
    now: () => new Date('2026-11-27T08:00:00Z'),
  })
}

const ACTIVE_ROW = '- insert:\n    - id: dsh-astryx\n      name: dsh-astryx\n      config:\n        ttlHours: 6\n'

test('healthy: row active, cli complete, skill effective, mcp unconfigured', async () => {
  const report = await makeCheck({ patch: ACTIVE_ROW, mcpResult: { ok: true, tools: ['search'], latencyMs: 5, error: '' } }).run({ projectPath: '/tmp/project' })
  assert.equal(report.ok, true)
  assert.equal(report.plugin.rowFound, true)
  assert.equal(report.plugin.rowDisabled, false)
  assert.equal(report.cli.found, true)
  assert.deepEqual(report.cli.missing, [])
  assert.equal(report.mcp.configured, false)
  assert.equal(report.mcp.basis, 'local-cli')
  assert.equal(report.mcp.reachable, true)
  assert.equal(report.skill.verdict, 'effective')
  assert.deepEqual(report.codes, [])
})

test('plugin-row-missing when the patch layer has no dsh-astryx row', async () => {
  const report = await makeCheck({ patch: '' }).run({})
  assert.equal(report.ok, false)
  assert.equal(report.failure.code, 'plugin-row-missing')
  assert.equal(report.plugin.rowFound, false)
})

test('plugin-row-disabled when the row is toggled off', async () => {
  const report = await makeCheck({ patch: '- id: dsh-astryx\n  disabled: true\n' }).run({})
  assert.equal(report.failure.code, 'plugin-row-disabled')
  assert.equal(report.plugin.rowDisabled, true)
})

test('mcp-unreachable when a configured server never answers', async () => {
  const patch = ACTIVE_ROW + `    - id: mcp-astryx
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: astryx
        transport: stdio
        command: /usr/local/bin/astryx
        args:
          - mcp
`
  const report = await makeCheck({ patch, mcpResult: { ok: false, tools: [], latencyMs: 120, error: 'server exited (1) before tools/list' } }).run({})
  assert.equal(report.failure.code, 'mcp-unreachable')
  assert.equal(report.mcp.configured, true)
  assert.match(report.mcp.error, /before tools\/list/)
})

test('a configured reachable server reports its tool count', async () => {
  const patch = ACTIVE_ROW + `    - id: mcp-astryx
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: astryx
        transport: stdio
        command: /usr/local/bin/astryx
`
  const report = await makeCheck({ patch, mcpResult: { ok: true, tools: ['search', 'component'], latencyMs: 40, error: '' } }).run({})
  assert.equal(report.ok, true)
  assert.equal(report.mcp.reachable, true)
  assert.equal(report.mcp.toolsCount, 2)
  assert.equal(report.mcp.basis, 'dsh-row')
})

test('skill-invalid when the frontmatter is broken', async () => {
  const root = tree({ 'skills/astryx/SKILL.md': '---\nname: astryx\n---\n' })
  const report = await makeCheck({ patch: ACTIVE_ROW, skillRoot: root }).run({})
  assert.equal(report.failure.code, 'skill-invalid')
})

test('contract-drift when the CLI no longer provides a required command', async () => {
  const report = await makeCheck({ patch: ACTIVE_ROW, commands: ['docs'] }).run({})
  assert.equal(report.failure.code, 'contract-drift')
  assert.match(report.failure.message, /manifest/)
})

test('reports the project AGENTS.md block when astryx init ran', async () => {
  const root = tree({
    'skills/astryx/SKILL.md': VALID_SKILL,
    'AGENTS.md': '<!-- ASTRYX:START -->\nUse Astryx.\n<!-- ASTRYX:END -->\n',
  })
  const patchFile = join(root, 'cordis.patch.yml')
  writeFileSync(patchFile, ACTIVE_ROW)
  const report = await makeCheck({ patch: ACTIVE_ROW, skillRoot: root }).run({ projectPath: root })
  assert.equal(report.project.agentsBlock, true)
})
