import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Looks for the Astryx skill in the directories DSH loads skills from.
 * DSH reads both `$DSH_HOME/skills` and the machine-level `~/.agents/skills`
 * (verified: a skill placed only in the latter shows up in the catalog), so a
 * file in either one is effective; project folders are reported but are not a
 * machine-wide install.
 */
export class SkillCheck {
  constructor({ roots = [], projectDir = '' } = {}) {
    this.roots = roots
    this.projectDir = projectDir
  }

  locations() {
    const list = this.roots.map((root) => ({
      id: root.id,
      path: join(root.path, 'astryx', 'SKILL.md'),
      visibleToDsh: true,
      scope: 'machine',
    }))
    if (this.projectDir) {
      list.push(
        { id: 'project-agents', path: join(this.projectDir, '.agents', 'skills', 'astryx-project', 'SKILL.md'), visibleToDsh: false, scope: 'project' },
        { id: 'project-claude', path: join(this.projectDir, '.claude', 'skills', 'astryx-project', 'SKILL.md'), visibleToDsh: false, scope: 'project' },
      )
    }
    return list
  }

  inspect() {
    const locations = this.locations().map((location) => this.#inspectOne(location))
    const effective = locations.find((location) => location.exists && location.valid && location.visibleToDsh)
    const anyValid = locations.find((location) => location.exists && location.valid)
    let verdict = 'missing'
    if (effective) verdict = 'effective'
    else if (anyValid) verdict = anyValid.scope === 'project' ? 'project-only' : 'invisible'
    else if (locations.some((location) => location.exists)) verdict = 'invalid'
    return { verdict, effectivePath: effective?.path ?? '', roots: this.roots.map((root) => root.path), locations }
  }

  #inspectOne(location) {
    const exists = existsSync(location.path)
    if (!exists) return { ...location, exists: false, valid: false, name: '', description: '', link: '', bytes: 0 }
    let link = ''
    let bytes = 0
    try {
      if (lstatSync(location.path).isSymbolicLink()) link = realpathSync(location.path)
      bytes = statSync(location.path).size
    } catch {}
    const frontmatter = readFrontmatter(location.path)
    return {
      ...location,
      exists: true,
      valid: Boolean(frontmatter.name && frontmatter.description),
      name: frontmatter.name,
      description: frontmatter.description,
      link,
      bytes,
    }
  }
}

export function readFrontmatter(path) {
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return { name: '', description: '' }
  }
  const normalized = text.replace(/\r\n?/g, '\n')
  if (!normalized.startsWith('---')) return { name: '', description: '' }
  const end = normalized.indexOf('\n---', 3)
  if (end === -1) return { name: '', description: '' }
  const block = normalized.slice(3, end)
  const name = /^name:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? ''
  const description = /^description:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? ''
  return { name: name.replace(/^['"]|['"]$/g, ''), description: description.replace(/^['"]|['"]$/g, '') }
}
