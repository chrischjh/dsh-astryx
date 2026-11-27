import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Looks for the Astryx skill where Astryx writes it, and says whether DSH can
 * actually load it. A file in ~/.agents is not visible to DSH's catalog, which
 * is the difference between "installed" and "effective".
 */
export class SkillCheck {
  constructor({ dshSkills = '', agentsSkills = '', projectDir = '' } = {}) {
    this.dshSkills = dshSkills
    this.agentsSkills = agentsSkills
    this.projectDir = projectDir
  }

  locations() {
    const list = [
      { id: 'dsh', path: join(this.dshSkills, 'astryx', 'SKILL.md'), visibleToDsh: true },
      { id: 'computer', path: join(this.agentsSkills, 'astryx', 'SKILL.md'), visibleToDsh: false },
    ]
    if (this.projectDir) {
      list.push(
        { id: 'project-agents', path: join(this.projectDir, '.agents', 'skills', 'astryx-project', 'SKILL.md'), visibleToDsh: false },
        { id: 'project-claude', path: join(this.projectDir, '.claude', 'skills', 'astryx-project', 'SKILL.md'), visibleToDsh: false },
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
    else if (anyValid && !anyValid.visibleToDsh) verdict = anyValid.id.startsWith('project') ? 'project-only' : 'invisible'
    else if (locations.some((location) => location.exists)) verdict = 'invalid'
    return { verdict, effectivePath: effective?.path ?? '', locations }
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
  if (!text.startsWith('---')) return { name: '', description: '' }
  const end = text.indexOf('\n---', 3)
  if (end === -1) return { name: '', description: '' }
  const block = text.slice(3, end)
  const name = /^name:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? ''
  const description = /^description:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? ''
  return { name, description }
}
