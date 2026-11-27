import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadBundledSkill, registrationFor, registerSkillEffect } from '../src/skillInstall.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

test('the vendored Astryx skill carries name, description and the workflow', () => {
  const skill = loadBundledSkill(join(ROOT, 'skills'))
  assert.ok(skill)
  assert.equal(skill.name, 'astryx')
  assert.match(skill.description, /design system/)
  assert.match(skill.body, /astryx build/)
  assert.match(skill.body, /astryx component <Name>/)
})

test('the vendored file still matches its lock hash', () => {
  const lock = JSON.parse(readFileSync(join(ROOT, 'skills.lock.json'), 'utf8'))
  const hash = createHash('sha256').update(readFileSync(join(ROOT, 'skills.astryx.SKILL.md'.replace('skills.astryx.', 'skills/astryx/')))).digest('hex')
  assert.equal(lock.skills.astryx.sha256, hash)
})

test('registration keeps the body and appends the DSH notes', () => {
  const skill = loadBundledSkill(join(ROOT, 'skills'))
  const registration = registrationFor(skill)
  assert.equal(registration.name, 'astryx')
  assert.equal(registration.source, 'bundled')
  assert.equal(registration.provider, 'dsh-astryx')
  assert.match(registration.content, /DeepSeek Harness \(dsh-astryx bundle\)/)
  assert.match(registration.content, /astryx_setup/)
  assert.deepEqual(registration.resourceBase, { kind: 'directory', path: skill.dir })
})

test('registerSkillEffect registers when no Astryx skill is loaded', () => {
  const calls = []
  const ctx = { get: (name) => (name === 'skills' ? { register: (input) => { calls.push(input); return () => {} } } : undefined) }
  const effect = registerSkillEffect(ctx, { paths: { skillRoots: [{ id: 'dsh', path: '/nonexistent/skills' }] } })
  assert.equal(typeof effect, 'function')
  effect()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'astryx')
})

test('registerSkillEffect stays quiet when a loaded copy already exists', () => {
  const loaded = join(ROOT, 'skills')
  const ctx = { get: (name) => (name === 'skills' ? { register: () => { throw new Error('should not register') } } : undefined) }
  const effect = registerSkillEffect(ctx, { paths: { skillRoots: [{ id: 'dsh', path: loaded }] } })
  assert.equal(effect, undefined)
})

test('ctx without skills yields no effect', () => {
  const effect = registerSkillEffect({ get: () => undefined }, { paths: { skillRoots: [] } })
  assert.equal(effect, undefined)
})
