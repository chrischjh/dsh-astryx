import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SkillCheck } from './skills.js'

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * The Astryx skill is what makes an agent an Astryx developer: it carries the
 * build → template → component workflow and the prop-naming conventions.
 * The plugin ships it so enabling the plugin is enough — no CLI install, no
 * `astryx init --user`, no dependence on where the CLI wrote its copy.
 * When the computer already has an Astryx skill in a DSH-loaded root, that copy
 * wins (it is the one the CLI keeps in sync) and this bundle stays quiet.
 */
export function loadBundledSkill(root = '') {
  const dir = join(root, 'astryx')
  const path = join(dir, 'SKILL.md')
  if (!existsSync(path)) return undefined
  const raw = readFileSync(path, 'utf8')
  const match = raw.match(FRONTMATTER)
  if (match === null) return undefined
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/)
    if (entry === null) continue
    let value = entry[2].trim()
    const quoted = value.match(/^(["'])([\s\S]*)\1$/)
    if (quoted !== null) value = quoted[2]
    fields[entry[1]] = value
  }
  if (!fields.name || !fields.description) return undefined
  return {
    name: fields.name,
    description: fields.description,
    body: raw.slice(match[0].length).trimEnd(),
    dir,
    path,
  }
}

/** DSH-specific notes appended at registration; the vendored file stays byte-identical. */
export function addendumFor(skill) {
  return [
    '',
    '---',
    '',
    '## In DeepSeek Harness (dsh-astryx bundle)',
    '',
    '- This copy ships with the dsh-astryx plugin, so the skill is present whenever the plugin is enabled. If the computer also has the CLI-written copy (the `astryx` command keeps it current), that copy is the one in your catalog.',
    '- `astryx` is on `PATH` when the CLI was installed globally; otherwise the project\'s own `node_modules/@astryxdesign/cli` answers. If neither exists, run `npm i -g @astryxdesign/cli` as this skill says.',
    '- `astryx_setup` reports project readiness (React 19, core, a theme package, the CLI, the agent-docs block) before you build the first page; `astryx_selfcheck` reports the local wiring. Both are read-only.',
    '- Never invent an Astryx component API from memory: `astryx component <Name>` prints the props, and `astryx search` finds the right page. Follow the WORKFLOW above (build → template → component) instead of writing a page from scratch.',
    '',
  ].join('\n')
}

export function registrationFor(skill) {
  return {
    name: skill.name,
    description: skill.description,
    content: `${skill.body}\n${addendumFor(skill)}`,
    source: 'bundled',
    provider: 'dsh-astryx',
    path: skill.path,
    resourceBase: { kind: 'directory', path: skill.dir },
    metadata: { upstream: 'astryx CLI skill', plugin: 'dsh-astryx' },
  }
}

/**
 * Register the bundled skill unless a DSH-loaded root already provides one.
 * Returns the effect factory for ctx.effect, or undefined when ctx.skills is absent.
 */
export function registerSkillEffect(ctx, { paths, log = () => {} } = {}) {
  const skills = ctx.get('skills')
  if (skills === undefined || typeof skills.register !== 'function') return undefined
  const root = join(fileURLToPath(new URL('..', import.meta.url)), 'skills')
  const bundled = loadBundledSkill(root)
  if (bundled === undefined) {
    log('bundled skills/astryx/SKILL.md is missing or has no frontmatter; no Astryx skill registered')
    return undefined
  }
  const roots = paths?.skillRoots ?? []
  const existing = new SkillCheck({ roots }).inspect()
  if (existing.verdict === 'effective') {
    log(`an Astryx skill is already loaded from ${existing.effectivePath}; the bundled copy is not registered`)
    return undefined
  }
  return () => skills.register(registrationFor(bundled))
}
