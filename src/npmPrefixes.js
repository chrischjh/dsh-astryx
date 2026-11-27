import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Candidate npm global prefixes, found without trusting PATH or process.execPath.
 * The Host runs inside Electron, where execPath is the app binary and PATH is the
 * short one a GUI launch inherits, so a global CLI has to be located by layout:
 * npm puts packages under `<prefix>/lib/node_modules` (POSIX) or
 * `<prefix>/node_modules` (Windows), and versioned Node installs (Homebrew, nvm,
 * asdf) add one directory level.
 */
export function npmPrefixCandidates({ env = process.env, platform = process.platform, homeDir = '', extraRoots = [] } = {}) {
  const home = homeDir || env.HOME || env.USERPROFILE || homedir()
  const prefixes = new Set()
  const add = (value) => {
    if (typeof value === 'string' && value.trim()) prefixes.add(value.trim())
  }

  add(env.npm_config_prefix)
  add(env.PNPM_HOME)
  add(npmrcPrefix(home))

  if (platform === 'win32') {
    add(env.APPDATA && join(env.APPDATA, 'npm'))
    add(env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'npm'))
    add(env.ProgramFiles && join(env.ProgramFiles, 'nodejs'))
  } else {
    for (const root of [
      '/opt/homebrew/lib/nodejs',
      '/usr/local/lib/nodejs',
      '/usr/local',
      join(home, '.npm-global'),
      join(home, '.nvm', 'versions', 'node'),
      join(home, '.asdf', 'installs', 'nodejs'),
      join(home, '.volta'),
      join(home, 'Library', 'pnpm'),
      ...extraRoots,
    ]) {
      add(root)
      for (const child of versionedChildren(root, platform)) {
        add(child)
        add(join(child, 'lib'))
      }
    }
  }

  return [...prefixes].filter((prefix) => existsSync(prefix))
}

/** `prefix = ...` from ~/.npmrc, which survives a GUI launch. */
export function npmrcPrefix(home) {
  for (const file of [join(home, '.npmrc')]) {
    try {
      const text = readFileSync(file, 'utf8')
      const match = /^prefix\s*=\s*(.+)$/m.exec(text)
      if (match) return match[1].trim().replace(/^['"]|['"]$/g, '')
    } catch {}
  }
  return ''
}

function versionedChildren(root, platform) {
  if (platform === 'win32' || !existsSync(root)) return []
  try {
    return readdirSync(root)
      .filter((entry) => /^(?:node-)?v?\d/i.test(entry))
      .map((entry) => join(root, entry))
  } catch {
    return []
  }
}
