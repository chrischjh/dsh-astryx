import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Reads the patch layers DSH applies (home + profile) and returns their rows.
 * Line-based on purpose: patch rows are simple lists, and a YAML dependency in
 * a Host plugin buys trouble. Nested `config:` values are read shallowly.
 */
export class PatchScan {
  constructor({ files = [] } = {}) {
    this.files = files
  }

  rows() {
    const rows = []
    for (const file of this.files) {
      const text = readText(file)
      if (text) rows.push(...parseRows(text, file))
    }
    return rows
  }

  byId(id) {
    // Later layers win, so the last matching row is the applied one.
    const matches = this.rows().filter((row) => row.id === id)
    return matches.at(-1) ?? null
  }

  mcpRows() {
    return this.rows().filter((row) => row.name === '@deepseek-ai/dsh-mcp-client')
  }

  mcpRowsFor(word) {
    const needle = word.toLowerCase()
    return this.mcpRows().filter((row) => {
      const haystack = [row.serverName, row.command, row.url, row.args].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  }
}

export function parseRows(text, source = '') {
  const rows = []
  let row = null
  let inConfig = false
  let collectingArgs = false
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '')
    const idMatch = /^\s*-\s+id:\s*(.+)$/.exec(line)
    if (idMatch) {
      row = { id: clean(idMatch[1]), name: '', disabled: false, serverName: '', command: '', url: '', transport: '', args: '', source }
      rows.push(row)
      inConfig = false
      continue
    }
    if (!row) continue
    if (/^\s*config:/.test(line)) {
      inConfig = true
      continue
    }
    if (collectingArgs) {
      const itemMatch = /^\s*-\s+(.+)$/.exec(line)
      if (itemMatch) {
        row.args = `${row.args}${row.args ? ',' : ''}${clean(itemMatch[1])}`
        continue
      }
      collectingArgs = false
    }
    const keyMatch = /^(\s*)([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (!keyMatch) continue
    const key = keyMatch[2]
    if (key === 'disabled' && !inConfig) {
      row.disabled = clean(keyMatch[3]) === 'true'
      continue
    }
    if (!inConfig && key === 'name' && !row.name) {
      row.name = clean(keyMatch[3])
      continue
    }
    if (inConfig && key === 'serverName') row.serverName = clean(keyMatch[3])
    if (inConfig && key === 'command') row.command = clean(keyMatch[3])
    if (inConfig && key === 'url') row.url = clean(keyMatch[3])
    if (inConfig && key === 'transport') row.transport = clean(keyMatch[3])
    if (inConfig && key === 'args') collectingArgs = clean(keyMatch[3]) === ''
  }
  return rows
}

function clean(value) {
  return String(value ?? '').trim().replace(/^['"]|['"]$/g, '')
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

/**
 * Every patch layer DSH applies, in apply order (bundle patches first, then the
 * profile patch, then the home patch). Bundle patches matter: a row this plugin
 * declares lives there, not in the profile patch.
 */
export function discoverPatchFiles({ profileDir = '', home = '', ownPackage = 'dsh-astryx' } = {}) {
  const profiles = profileDir ? [profileDir] : safeProfiles(home)
  const owner = profiles.find((dir) => existsSync(join(dir, 'node_modules', ownPackage, 'package.json'))) ?? profiles[0] ?? ''
  const files = []
  if (owner) {
    for (const file of bundlePatches(join(owner, 'node_modules'))) files.push(file)
    const profilePatch = join(owner, 'cordis.patch.yml')
    if (existsSync(profilePatch)) files.push(profilePatch)
  }
  const homePatch = join(home, 'cordis.patch.yml')
  if (existsSync(homePatch)) files.push(homePatch)
  return files
}

function safeProfiles(home) {
  if (!home) return []
  return safeReaddir(join(home, 'profiles')).map((name) => join(home, 'profiles', name))
}

function bundlePatches(nodeModules) {
  if (!existsSync(nodeModules)) return []
  const found = []
  for (const entry of safeReaddir(nodeModules)) {
    if (entry.startsWith('@')) {
      for (const child of safeReaddir(join(nodeModules, entry))) found.push(...patchIn(join(nodeModules, entry, child)))
      continue
    }
    found.push(...patchIn(join(nodeModules, entry)))
  }
  return found
}

function patchIn(dir) {
  const file = join(dir, 'cordis.patch.yml')
  return existsSync(file) ? [file] : []
}

function safeReaddir(dir) {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
