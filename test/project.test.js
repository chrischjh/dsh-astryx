import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'
import { ProjectProbe } from '../src/project.js'

const posix = (value) => String(value).replace(/\\/g, '/')


const ENTRY = ['clients', 'cli', 'bin', 'astryx.mjs']

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-astryx-'))
  for (const [path, content] of Object.entries(files)) {
    const target = join(dir, path)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }
  return dir
}

function fakeChild(stdout, code = 0) {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => {}
  setImmediate(() => {
    if (stdout) child.stdout.emit('data', stdout)
    child.emit('close', code)
  })
  return child
}

function probe(options) {
  // execPath '' keeps the real machine's npm prefix out of these fixtures.
  return new ProjectProbe({ fallbackPrefixes: [], npmPrefixes: [], env: { PATH: '' }, execPath: '', ...options })
}

test('finds a project by node_modules and reads installed versions', () => {
  const dir = tree({
    'package.json': JSON.stringify({ name: 'app' }),
    'node_modules/@astryxdesign/core/package.json': JSON.stringify({ version: '0.7.17' }),
    'node_modules/@astryxdesign/cli/package.json': JSON.stringify({ version: '0.7.16' }),
  })
  const located = probe({ startDir: join(dir, 'src') }).locate()
  assert.equal(located.found, true)
  assert.equal(located.dir, dir)
  const installed = probe({ startDir: dir }).installed(dir)
  assert.equal(installed.core, '0.7.17')
  assert.equal(installed.cli, '0.7.16')
  assert.equal(installed.source, 'node_modules')
})

test('finds a project by declared dependency and reports ranges', () => {
  const dir = tree({ 'package.json': JSON.stringify({ name: 'app', dependencies: { '@astryxdesign/core': '^0.7.0' } }) })
  const instance = probe({ startDir: dir })
  assert.equal(instance.locate().found, true)
  assert.equal(instance.installed(dir).source, 'package.json')
})

test('reports no project when nothing mentions astryx', () => {
  const dir = tree({ 'package.json': JSON.stringify({ name: 'app', dependencies: { react: '^19.0.0' } }) })
  const instance = probe({ startDir: dir })
  assert.equal(instance.locate().found, false)
})

test('no CLI candidates without a project entry, prefix or shim', () => {
  const dir = tree({ 'package.json': JSON.stringify({ name: 'app' }) })
  assert.deepEqual(probe({ startDir: dir, platform: 'linux' }).cliCandidates(dir), [])
  assert.deepEqual(probe({ startDir: dir, platform: 'win32' }).cliCandidates(dir), [])
})

test('project CLI runs as a node script, never as a shim', () => {
  const dir = tree({
    'package.json': JSON.stringify({ name: 'app' }),
    'node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs': '#!/usr/bin/env node\n',
  })
  const candidates = probe({ startDir: dir }).cliCandidates(dir)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].via, 'project-cli')
  assert.equal(candidates[0].kind, 'node-script')
  assert.equal(candidates[0].file, process.execPath)
  assert.deepEqual(candidates[0].args.slice(1), ['manifest', '--json'])
})

test('global install resolves through the POSIX lib/node_modules layout', () => {
  const prefix = tree({ 'lib/node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs': '' })
  const candidates = probe({ npmPrefixes: [prefix] }).cliCandidates('')
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].via, 'global-cli')
  assert.match(posix(candidates[0].args[0]), /lib\/node_modules\/@astryxdesign/)
  assert.deepEqual(candidates[0].args.slice(1), ['manifest', '--json'])
})

test('global install resolves through the Windows node_modules layout', () => {
  const prefix = tree({ 'node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs': '' })
  const candidates = probe({ platform: 'win32', npmPrefixes: [prefix] }).cliCandidates('')
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].via, 'global-cli')
  assert.match(posix(candidates[0].args[0]), /node_modules\/@astryxdesign/)
})

test('a PATH shim is the last resort and keeps Windows quoting for later', () => {
  const bin = tree({ 'astryx.cmd': '' })
  const candidates = probe({
    platform: 'win32',
    env: { PATH: bin, PATHEXT: '.COM;.EXE;.BAT;.CMD' },
  }).cliCandidates('')
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].via, 'global-shim')
  assert.ok(candidates[0].file.endsWith('.cmd'))
})

test('resolves npm globals through the running Node prefix', () => {
  const prefix = tree({
    'bin/node': '',
    'lib/node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs': '',
  })
  const candidates = probe({ env: { PATH: '' }, execPath: join(prefix, 'bin', 'node') }).cliCandidates('')
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].via, 'global-cli')
})

test('reads the envelope-shaped manifest the real CLI prints', async () => {
  const dir = tree({
    'package.json': JSON.stringify({ name: 'app' }),
    'node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs': '',
  })
  const manifest = {
    apiVersion: 1,
    type: 'manifest',
    data: {
      name: 'astryx',
      version: '0.7.17',
      commands: [
        { name: 'init', options: [{ flag: '--features <list>' }, { flag: '--to <places>' }] },
        { name: 'docs', options: [] },
        { name: 'swizzle', options: [] },
      ],
    },
  }
  const instance = new ProjectProbe({
    startDir: dir,
    fallbackPrefixes: [],
    env: { PATH: '' },
    execPath: '',
    spawnImpl: () => fakeChild(JSON.stringify(manifest)),
  })
  const raw = await instance.runCli({ projectDir: dir })
  assert.equal(raw.ran, true)
  assert.equal(raw.version, '0.7.17')
  assert.deepEqual(raw.commands, ['init', 'docs', 'swizzle'])
  assert.equal(raw.initFlags, '--to')
})
