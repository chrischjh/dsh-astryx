import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SkillCheck, readFrontmatter } from '../src/skills.js'

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-astryx-skill-'))
  for (const [path, content] of Object.entries(files)) {
    const target = join(dir, path)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }
  return dir
}

const VALID = '---\nname: astryx\ndescription: Build UI with Astryx.\n---\n\n# Astryx\n'

function roots(root) {
  return [
    { id: 'dsh', path: join(root, 'skills') },
    { id: 'agents', path: join(root, 'agents', 'skills') },
  ]
}

test('effective in the DSH skill root', () => {
  const root = tree({ 'skills/astryx/SKILL.md': VALID })
  const result = new SkillCheck({ roots: roots(root) }).inspect()
  assert.equal(result.verdict, 'effective')
  assert.match(result.effectivePath, /skills\/astryx\/SKILL.md/)
  assert.equal(result.roots.length, 2)
  const dsh = result.locations.find((location) => location.id === 'dsh')
  assert.equal(dsh.visibleToDsh, true)
  assert.equal(dsh.scope, 'machine')
  assert.equal(dsh.bytes > 0, true)
})

test('effective in ~/.agents/skills, which DSH also loads', () => {
  const root = tree({ 'agents/skills/astryx/SKILL.md': VALID })
  const result = new SkillCheck({ roots: roots(root) }).inspect()
  assert.equal(result.verdict, 'effective')
  assert.match(result.effectivePath, /agents\/skills\/astryx\/SKILL.md/)
})

test('project-only for a project skill without a machine-wide copy', () => {
  const root = tree({ 'project/.agents/skills/astryx-project/SKILL.md': VALID })
  const result = new SkillCheck({ roots: roots(root), projectDir: join(root, 'project') }).inspect()
  assert.equal(result.verdict, 'project-only')
})

test('invalid when the frontmatter loses its description', () => {
  const root = tree({ 'skills/astryx/SKILL.md': '---\nname: astryx\n---\n' })
  const result = new SkillCheck({ roots: roots(root) }).inspect()
  assert.equal(result.verdict, 'invalid')
  assert.equal(result.locations.find((location) => location.id === 'dsh').valid, false)
})

test('missing when nothing is installed anywhere', () => {
  const result = new SkillCheck({ roots: [{ id: 'dsh', path: '/nonexistent/skills' }] }).inspect()
  assert.equal(result.verdict, 'missing')
  assert.ok(result.locations.every((location) => location.exists === false && location.bytes === 0))
})

test('readFrontmatter tolerates files without frontmatter', () => {
  const root = tree({ 'plain/SKILL.md': '# no frontmatter\n' })
  assert.deepEqual(readFrontmatter(join(root, 'plain', 'SKILL.md')), { name: '', description: '' })
})

test('readFrontmatter survives CRLF and quoted values', () => {
  const root = tree({ 'win/SKILL.md': '---\r\nname: astryx\r\ndescription: "Astryx on Windows."\r\n---\r\n\r\n# Astryx\r\n' })
  const frontmatter = readFrontmatter(join(root, 'win', 'SKILL.md'))
  assert.equal(frontmatter.name, 'astryx')
  assert.equal(frontmatter.description, 'Astryx on Windows.')
})
