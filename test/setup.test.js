import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SetupCheck, setupText } from '../src/setup.js'
import { ProjectProbe } from '../src/project.js'

const VALID_SKILL = '---\nname: astryx\ndescription: Build UI with Astryx.\n---\n\n# Astryx\n'

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-astryx-setup-'))
  for (const [path, content] of Object.entries(files)) {
    const target = join(dir, path)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }
  return dir
}

function check(dir, { skillsRoot } = {}) {
  return new SetupCheck({
    paths: { skillRoots: [{ id: 'agents', path: join(skillsRoot ?? join(dir, 'no-skills'), 'skills') }] },
    startDir: dir,
    makeProbe: (startDir) => new ProjectProbe({
      startDir,
      fallbackPrefixes: [],
      npmPrefixes: [],
      env: { PATH: '' },
      execPath: '',
    }),
  })
}

test('ready when every project fact is in place', () => {
  const dir = tree({
    'package.json': JSON.stringify({ name: 'app', dependencies: { react: '^19.0.0', '@astryxdesign/core': '^0.7.0' } }),
    'node_modules/react/package.json': JSON.stringify({ version: '19.2.0' }),
    'node_modules/@astryxdesign/core/package.json': JSON.stringify({ version: '0.7.17' }),
    'node_modules/@astryxdesign/theme-neutral/package.json': JSON.stringify({ version: '0.7.17' }),
    'node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs': '',
    'AGENTS.md': '<!-- ASTRYX:START -->\nUse Astryx.\n<!-- ASTRYX:END -->\n',
    'skills/astryx/SKILL.md': VALID_SKILL,
  })
  const result = check(dir, { skillsRoot: dir }).run({})
  assert.equal(result.ready, true)
  assert.equal(result.skillVerdict, 'effective')
  assert.ok(result.checks.every((entry) => entry.ok))
  assert.match(setupText(result), /ready: this project can build UI with Astryx/)
})

test('not ready without a theme package, and the action names the install', () => {
  const dir = tree({
    'package.json': JSON.stringify({ name: 'app' }),
    'node_modules/react/package.json': JSON.stringify({ version: '19.2.0' }),
    'node_modules/@astryxdesign/core/package.json': JSON.stringify({ version: '0.7.17' }),
    'node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs': '',
    'AGENTS.md': '<!-- ASTRYX:START -->\n<!-- ASTRYX:END -->\n',
  })
  const result = check(dir).run({})
  assert.equal(result.ready, false)
  const theme = result.checks.find((entry) => entry.id === 'theme')
  assert.equal(theme.ok, false)
  assert.match(theme.action, /theme-neutral/)
})

test('React 18 fails the React 19 requirement with a fix command', () => {
  const dir = tree({
    'package.json': JSON.stringify({ name: 'app' }),
    'node_modules/react/package.json': JSON.stringify({ version: '18.3.1' }),
  })
  const result = check(dir).run({})
  const react = result.checks.find((entry) => entry.id === 'react')
  assert.equal(react.ok, false)
  assert.equal(react.action, 'npm i react@^19 react-dom@^19')
  assert.match(react.detail, /below >=19/)
})

test('missing agent-docs block asks for astryx init', () => {
  const dir = tree({ 'package.json': JSON.stringify({ name: 'app' }) })
  const result = check(dir).run({})
  const docs = result.checks.find((entry) => entry.id === 'agent-docs')
  assert.equal(docs.ok, false)
  assert.equal(docs.action, 'astryx init')
})

test('a missing CLI and a missing skill are both reported', () => {
  const dir = tree({ 'package.json': JSON.stringify({ name: 'app' }) })
  const result = check(dir).run({})
  assert.equal(result.checks.find((entry) => entry.id === 'cli').action, 'npm i -g @astryxdesign/cli')
  assert.equal(result.skillVerdict, 'missing')
  assert.equal(result.checks.find((entry) => entry.id === 'expert-skill').ok, false)
})
