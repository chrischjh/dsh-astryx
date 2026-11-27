import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ProjectProbe } from './project.js'
import { SkillCheck } from './skills.js'
import { Semver } from './semver.js'

const THEMES = '@astryxdesign/theme-'

/**
 * "Can I start building UI with Astryx in this folder?" — the six facts an
 * agent needs before the first page, each with the exact command that fixes it.
 * Read-only: the plugin reports, it never installs or edits the project.
 */
export class SetupCheck {
  constructor({ paths = {}, startDir = process.cwd(), makeProbe, makeSkillCheck, packageJson } = {}) {
    this.paths = paths
    this.startDir = startDir
    this.makeProbe = makeProbe ?? ((dir) => new ProjectProbe({ startDir: dir }))
    this.makeSkillCheck = makeSkillCheck ?? ((projectDir) => new SkillCheck({ roots: paths.skillRoots ?? [], projectDir }))
    this.packageJson = packageJson
  }

  run({ projectPath } = {}) {
    const probe = this.makeProbe(projectPath || this.startDir)
    const project = probe.locate()
    const dir = project.dir
    const checks = [
      this.#dependency(dir, 'react', 'react', 'React 19 or newer', '>=19.0.0'),
      this.#dependency(dir, '@astryxdesign/core', 'core', 'Astryx core package', ''),
      this.#theme(dir),
      this.#cli(probe, dir),
      this.#agentsBlock(dir),
    ]
    const skill = this.makeSkillCheck(dir).inspect()
    checks.push({
      id: 'expert-skill',
      ok: skill.verdict === 'effective',
      detail: skillDetail(skill),
      action: 'npm i -g @astryxdesign/cli && astryx init --user',
    })
    const ready = checks.filter((check) => check.id !== 'expert-skill').every((check) => check.ok)
    return { ready, project: { path: dir ?? '', found: project.found }, checks, skillVerdict: skill.verdict }
  }

  #dependency(dir, pkg, id, label, range) {
    const version = readVersion(dir, pkg)
    const declared = this.#declared(dir, pkg)
    if (version === '') {
      return { id, ok: false, detail: `${label} is not installed in this project`, action: installCommand(pkg, range) }
    }
    if (range !== '' && !Semver.satisfies(version, range)) {
      return { id, ok: false, detail: `${label} ${version} is below ${range}`, action: installCommand(pkg, range) }
    }
    return { id, ok: true, detail: `${label} ${version}${declared ? ` (declared ${declared})` : ''}`, action: '' }
  }

  #theme(dir) {
    const themes = installedThemes(dir)
    if (themes.length === 0) {
      return { id: 'theme', ok: false, detail: 'no @astryxdesign/theme-* package is installed', action: 'npm i @astryxdesign/theme-neutral @stylexjs/stylex' }
    }
    return { id: 'theme', ok: true, detail: `theme: ${themes.join(', ')}`, action: '' }
  }

  #cli(probe, dir) {
    const candidates = probe.cliCandidates(dir)
    if (candidates.length === 0) {
      return { id: 'cli', ok: false, detail: 'the astryx CLI is not resolvable (project or npm global)', action: 'npm i -g @astryxdesign/cli' }
    }
    return { id: 'cli', ok: true, detail: `astryx CLI: ${candidates.map((candidate) => candidate.via).join(', ')}`, action: '' }
  }

  #agentsBlock(dir) {
    if (!dir) return { id: 'agent-docs', ok: false, detail: 'no project folder found', action: 'astryx init' }
    const file = join(dir, 'AGENTS.md')
    if (!existsSync(file)) {
      return { id: 'agent-docs', ok: false, detail: 'AGENTS.md has no Astryx block', action: 'astryx init' }
    }
    let text = ''
    try {
      text = readFileSync(file, 'utf8')
    } catch {}
    if (!text.includes('ASTRYX:')) {
      return { id: 'agent-docs', ok: false, detail: 'AGENTS.md exists but carries no ASTRYX block', action: 'astryx init' }
    }
    return { id: 'agent-docs', ok: true, detail: 'AGENTS.md carries the ASTRYX block from astryx init', action: '' }
  }

  #declared(dir, pkg) {
    if (!dir) return ''
    const manifest = this.packageJson ?? readJson(join(dir, 'package.json'))
    for (const block of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const range = manifest?.[block]?.[pkg]
      if (typeof range === 'string') return range
    }
    return ''
  }
}

export function setupText(result) {
  const lines = [result.ready ? 'ready: this project can build UI with Astryx' : 'not ready yet', `project: ${result.project.path || '-'}`]
  for (const check of result.checks) lines.push(`${check.ok ? 'ok  ' : 'MISS'} ${check.id}: ${check.detail}${check.ok || !check.action ? '' : ` → ${check.action}`}`)
  return lines.join('\n')
}

function skillDetail(skill) {
  if (skill.verdict === 'effective') return `Astryx skill loaded from ${skill.effectivePath}`
  if (skill.verdict === 'project-only') return 'only a project-level Astryx skill is present'
  if (skill.verdict === 'invalid') return 'the Astryx skill file has no valid frontmatter'
  return 'no Astryx skill is loaded; this bundle registers its own when enabled'
}

function installCommand(pkg, range) {
  if (pkg === 'react') return 'npm i react@^19 react-dom@^19'
  if (pkg === '@astryxdesign/core') return 'npm i @astryxdesign/core @stylexjs/stylex'
  return `npm i ${pkg}${range ? `@${range.replace(/^>=/, '')}` : ''}`
}

function readVersion(dir, pkg) {
  if (!dir) return ''
  return String(readJson(join(dir, 'node_modules', pkg, 'package.json'))?.version ?? '')
}

function installedThemes(dir) {
  if (!dir) return []
  const root = join(dir, 'node_modules', '@astryxdesign')
  const versions = []
  for (const entry of safeReaddir(root)) {
    if (!entry.startsWith(THEMES.slice('@astryxdesign/'.length))) continue
    const version = String(readJson(join(root, entry, 'package.json'))?.version ?? '')
    versions.push(version ? `${entry}@${version}` : entry)
  }
  return versions
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

function safeReaddir(dir) {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
