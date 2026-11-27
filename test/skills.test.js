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

test('effective when the skill sits in the DSH skill root', () => {
  const root = tree({ 'skills/astryx/SKILL.md': VALID })
  const check = new SkillCheck({ dshSkills: join(root, 'skills'), agentsSkills: join(root, 'agents', 'skills') })
  const result = check.inspect()
  assert.equal(result.verdict, 'effective')
  assert.match(result.effectivePath, /skills\/astryx\/SKILL.md/)
  const visible = result.locations.find((location) => location.id === 'dsh')
  assert.equal(visible.visibleToDsh, true)
  assert.equal(visible.valid, true)
  assert.equal(visible.bytes > 0, true)
})

test('invisible when it only exists where DSH cannot see it', () => {
  const root = tree({ 'agents/skills/astryx/SKILL.md': VALID })
  const check = new SkillCheck({ dshSkills: join(root, 'skills'), agentsSkills: join(root, 'agents', 'skills') })
  assert.equal(check.inspect().verdict, 'invisible')
})

test('project-only for a project skill without a machine-wide copy', () => {
  const root = tree({ 'project/.agents/skills/astryx-project/SKILL.md': VALID })
  const check = new SkillCheck({
    dshSkills: join(root, 'skills'),
    agentsSkills: join(root, 'agents', 'skills'),
    projectDir: join(root, 'project'),
  })
  assert.equal(check.inspect().verdict, 'project-only')
})

test('invalid when the frontmatter loses its description', () => {
  const root = tree({ 'skills/astryx/SKILL.md': '---\nname: astryx\n---\n' })
  const check = new SkillCheck({ dshSkills: join(root, 'skills'), agentsSkills: join(root, 'agents', 'skills') })
  const result = check.inspect()
  assert.equal(result.verdict, 'invalid')
  assert.equal(result.locations.find((location) => location.id === 'dsh').valid, false)
})

test('missing when nothing is installed anywhere', () => {
  const check = new SkillCheck({ dshSkills: '/nonexistent/skills', agentsSkills: '/nonexistent/agents' })
  const result = check.inspect()
  assert.equal(result.verdict, 'missing')
  assert.ok(result.locations.every((location) => location.exists === false && location.bytes === 0))
})

test('readFrontmatter tolerates a file without frontmatter', () => {
  const root = tree({ 'plain/SKILL.md': '# no frontmatter\n' })
  assert.deepEqual(readFrontmatter(join(root, 'plain', 'SKILL.md')), { name: '', description: '' })
})
