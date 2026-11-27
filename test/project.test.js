import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProjectProbe } from '../src/project.js'

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-astryx-'))
  for (const [path, content] of Object.entries(files)) {
    const target = join(dir, path)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }
  return dir
}

test('finds a project by node_modules and reads installed versions', () => {
  const dir = project({
    'package.json': JSON.stringify({ name: 'app' }),
    'node_modules/@astryxdesign/core/package.json': JSON.stringify({ version: '0.7.17' }),
    'node_modules/@astryxdesign/cli/package.json': JSON.stringify({ version: '0.7.16' }),
  })
  const probe = new ProjectProbe({ startDir: join(dir, 'src') })
  const located = probe.locate()
  assert.equal(located.found, true)
  assert.equal(located.dir, dir)
  const installed = probe.installed(dir)
  assert.equal(installed.core, '0.7.17')
  assert.equal(installed.cli, '0.7.16')
  assert.equal(installed.source, 'node_modules')
})

test('finds a project by declared dependency and reports ranges', () => {
  const dir = project({ 'package.json': JSON.stringify({ name: 'app', dependencies: { '@astryxdesign/core': '^0.7.0' } }) })
  const probe = new ProjectProbe({ startDir: dir })
  assert.equal(probe.locate().found, true)
  const installed = probe.installed(dir)
  assert.equal(installed.core, '0.7.0')
  assert.equal(installed.source, 'package.json')
})

test('reports no project when nothing mentions astryx', () => {
  const dir = project({ 'package.json': JSON.stringify({ name: 'app', dependencies: { react: '^19.0.0' } }) })
  const probe = new ProjectProbe({ startDir: dir })
  const located = probe.locate()
  assert.equal(located.found, false)
  assert.equal(probe.installed(located.dir).source, 'none')
})

test('cli candidates stay empty without a local or global astryx', () => {
  const dir = project({ 'package.json': JSON.stringify({ name: 'app' }) })
  const probe = new ProjectProbe({ startDir: dir })
  const original = process.env.PATH
  process.env.PATH = ''
  try {
    assert.equal(probe.cliCandidates(dir).length, 0)
  } finally {
    process.env.PATH = original
  }
})

test('offers the project CLI when the package is installed', () => {
  const dir = project({
    'package.json': JSON.stringify({ name: 'app' }),
    'node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs': '#!/usr/bin/env node\n',
  })
  const probe = new ProjectProbe({ startDir: dir })
  const candidates = probe.cliCandidates(dir)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].via, 'project-cli')
  assert.deepEqual(candidates[0].args.slice(1), ['manifest', '--json'])
})
