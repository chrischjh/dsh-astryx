import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { npmPrefixCandidates, npmrcPrefix } from '../src/npmPrefixes.js'

const CLI = ['@astryxdesign', 'cli', 'clients', 'cli', 'bin', 'astryx.mjs']

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-astryx-prefix-'))
  for (const path of files) {
    const target = join(dir, path)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, '')
  }
  return dir
}

test('reads a prefix from ~/.npmrc', () => {
  const home = tree(['.npmrc'])
  writeFileSync(join(home, '.npmrc'), 'registry=https://registry.npmjs.org\nprefix = /custom/npm\n')
  assert.equal(npmrcPrefix(home), '/custom/npm')
})

test('ignores an npmrc without a prefix line', () => {
  const home = tree(['.npmrc'])
  writeFileSync(join(home, '.npmrc'), 'registry=https://registry.npmjs.org\n')
  assert.equal(npmrcPrefix(home), '')
})

test('finds a Homebrew-style versioned Node install', () => {
  const root = tree([join('node-v22.1.0', 'lib', 'node_modules', ...CLI)])
  const candidates = npmPrefixCandidates({ env: {}, platform: 'linux', homeDir: '/nonexistent', extraRoots: [root] })
  assert.ok(candidates.some((candidate) => candidate.includes('node-v22.1.0')))
  assert.equal(root.length > 0, true)
})

test('finds the Windows npm prefix through APPDATA', () => {
  const appData = tree([join('npm', 'node_modules', ...CLI)])
  const candidates = npmPrefixCandidates({ env: { APPDATA: appData }, platform: 'win32', homeDir: '/nonexistent' })
  assert.ok(candidates.some((candidate) => candidate.endsWith('npm')))
})

test('returns no candidates when nothing exists on the machine', () => {
  const candidates = npmPrefixCandidates({ env: {}, platform: 'linux', homeDir: '/nonexistent' })
  assert.equal(candidates.filter((candidate) => candidate.includes('/nonexistent')).length, 0)
})
