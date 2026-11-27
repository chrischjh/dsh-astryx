import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { planSpawn } from './spawn.js'
import { npmPrefixCandidates } from './npmPrefixes.js'

const DEFAULT_PACKAGES = ['@astryxdesign/core', '@astryxdesign/cli']
const CLI_PACKAGE = '@astryxdesign/cli'
const CLI_ENTRY = ['clients', 'cli', 'bin', 'astryx.mjs']
const MAX_JSON_BYTES = 4 * 1024 * 1024

/** Finds a project that uses Astryx, reads its installed versions, and probes its CLI. */
export class ProjectProbe {
  constructor(options = {}) {
    this.startDir = resolve(options.startDir ?? process.cwd())
    this.spawnImpl = options.spawnImpl ?? spawn
    this.platform = options.platform ?? process.platform
    this.env = options.env ?? process.env
    this.packages = options.packages ?? DEFAULT_PACKAGES
    this.fallbackPrefixes = options.fallbackPrefixes ?? ['/usr/local', '/opt/homebrew', '/usr/local/lib/nodejs']
    this.execPath = options.execPath ?? process.execPath
    this.homeDir = options.homeDir ?? ''
    this.npmPrefixes = options.npmPrefixes ?? null
  }

  locate() {
    let dir = this.startDir
    let nearest = ''
    for (let depth = 0; depth < 12; depth += 1) {
      const manifest = join(dir, 'package.json')
      if (existsSync(manifest)) {
        if (!nearest) nearest = dir
        if (declaresAstryx(manifest, this.packages)) return { dir, found: true }
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return { dir: nearest, found: false }
  }

  installed(projectDir) {
    const versions = { core: '', cli: '', source: 'none' }
    if (!projectDir) return versions
    const fromModules = readInstalled(projectDir, this.packages)
    Object.assign(versions, fromModules)
    if (fromModules.source === 'node_modules') return versions
    Object.assign(versions, readDeclared(join(projectDir, 'package.json'), this.packages))
    return versions
  }

  /** Run order: the project's CLI, then any global install, then a PATH shim. */
  cliCandidates(projectDir) {
    const candidates = []
    const projectEntry = projectDir ? join(projectDir, 'node_modules', CLI_PACKAGE, ...CLI_ENTRY) : ''
    if (projectEntry && existsSync(projectEntry)) candidates.push(nodeScript('project-cli', projectEntry))
    const globalEntry = this.findGlobalEntry()
    if (globalEntry) candidates.push(nodeScript('global-cli', globalEntry))
    const shim = this.findOnPath(this.shimNames())
    if (shim) candidates.push({ via: 'global-shim', kind: 'shim', file: shim, args: ['manifest', '--json'] })
    return candidates
  }

  /**
   * npm puts a global package under `<prefix>/lib/node_modules` on POSIX and
   * `<prefix>/node_modules` on Windows, and the `bin` dir that lands on PATH is
   * `<prefix>/bin` or `<prefix>` respectively. PATH alone is unreliable (a GUI
   * app inherits a short PATH, and macOS writes these into a versioned prefix),
   * so walk the layouts instead of trusting `which`.
   */
  findGlobalEntry() {
    for (const prefix of this.prefixCandidates()) {
      for (const layout of [join('lib', 'node_modules'), 'node_modules']) {
        const entry = join(prefix, layout, CLI_PACKAGE, ...CLI_ENTRY)
        if (existsSync(entry)) return entry
      }
      const direct = join(prefix, CLI_PACKAGE, ...CLI_ENTRY)
      if (existsSync(direct)) return direct
    }
    return ''
  }

  prefixCandidates() {
    const prefixes = new Set(this.npmPrefixes ?? npmPrefixCandidates({ env: this.env, platform: this.platform, homeDir: this.homeDir }))
    for (const dir of this.pathDirs()) {
      prefixes.add(dir)
      prefixes.add(dirname(dir))
    }
    if (this.execPath) {
      prefixes.add(dirname(this.execPath))
      prefixes.add(dirname(dirname(this.execPath)))
    }
    for (const fallback of this.fallbackPrefixes) prefixes.add(fallback)
    return [...prefixes].filter((prefix) => prefix && existsSync(prefix))
  }

  pathDirs() {
    const raw = String(this.env.PATH ?? '')
    return raw.split(this.platform === 'win32' ? ';' : ':').filter(Boolean)
  }

  shimNames() {
    if (this.platform !== 'win32') return ['astryx']
    const extensions = (this.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    return ['astryx', ...extensions.map((extension) => `astryx${extension.toLowerCase()}`)]
  }

  findOnPath(names) {
    for (const dir of this.pathDirs()) {
      for (const name of names) {
        const candidate = join(dir, name)
        if (existsSync(candidate)) return candidate
      }
    }
    return ''
  }

  async runCli({ projectDir, timeoutMs = 12000 } = {}) {
    let lastError = ''
    let lastVia = 'none'
    for (const candidate of this.cliCandidates(projectDir)) {
      lastVia = candidate.via
      try {
        const stdout = await this.run(candidate, timeoutMs)
        const manifest = parseManifest(stdout)
        if (!manifest) throw new Error(`${candidate.via}: output was not a manifest`)
        return { ran: true, via: candidate.via, ...manifest }
      } catch (error) {
        lastError = `${candidate.via}: ${String(error?.message ?? error)}`
      }
    }
    return { ran: false, via: lastVia, version: '', commands: [], initFlags: '', error: lastError }
  }

  run(candidate, timeoutMs) {
    const plan = planSpawn({
      file: candidate.file,
      args: candidate.args,
      platform: this.platform,
      options: { stdio: ['ignore', 'pipe', 'pipe'] },
    })
    return new Promise((resolvePromise, reject) => {
      const child = this.spawnImpl(plan.file, plan.args, plan.options)
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      child.stdout.on('data', (chunk) => {
        if (stdout.length < MAX_JSON_BYTES) stdout += String(chunk)
      })
      child.stderr.on('data', (chunk) => {
        if (stderr.length < 2000) stderr += String(chunk)
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolvePromise(stdout)
        else reject(new Error(`exit ${code}${stderr ? `: ${stderr.trim().slice(0, 300)}` : ''}`))
      })
    })
  }
}

function nodeScript(via, entry) {
  return { via, kind: 'node-script', file: process.execPath, args: [entry, 'manifest', '--json'] }
}

function parseManifest(stdout) {
  let json
  try {
    json = JSON.parse(stdout)
  } catch {
    return null
  }
  // Astryx answers with an envelope: { apiVersion, type, data: { version, commands } }.
  const body = typeof json?.data === 'object' && json.data !== null ? json.data : json
  return { version: String(body?.version ?? ''), commands: collectNames(body?.commands), initFlags: collectInitFlags(body) }
}

function collectNames(list, names = []) {
  if (!Array.isArray(list) && list && typeof list === 'object') list = Object.values(list)
  if (!Array.isArray(list)) return names
  for (const entry of list) {
    if (typeof entry?.name === 'string') names.push(entry.name)
    collectNames(entry?.subcommands, names)
  }
  return names
}

function collectInitFlags(json) {
  const init = findCommand(json?.commands, 'init')
  if (!init) return ''
  const flags = []
  for (const option of init.options ?? []) {
    for (const key of ['flag', 'long', 'name']) {
      if (typeof option?.[key] === 'string') flags.push(option[key])
    }
    if (Array.isArray(option?.flags)) flags.push(...option.flags.map(String))
  }
  if (flags.join(' ').includes('--to')) return '--to'
  return JSON.stringify(json).includes('"--to"') ? '--to' : ''
}

function findCommand(list, name) {
  for (const entry of list ?? []) {
    if (entry?.name === name) return entry
    const nested = findCommand(entry?.subcommands, name)
    if (nested) return nested
  }
  return null
}

function declaresAstryx(manifestPath, packages) {
  const dir = dirname(manifestPath)
  if (existsSync(join(dir, 'node_modules', '@astryxdesign'))) return true
  const manifest = readManifest(manifestPath)
  if (!manifest) return false
  const names = new Set(packages)
  const blocks = ['dependencies', 'devDependencies', 'peerDependencies']
  return blocks.some((block) => names.has(packageAt(manifest[block])))
}

function packageAt(block) {
  if (!block || typeof block !== 'object') return ''
  return Object.keys(block).find((key) => key.startsWith('@astryxdesign/')) ?? ''
}

function readInstalled(projectDir, packages) {
  const versions = { core: '', cli: '', source: 'node_modules' }
  let found = false
  for (const name of packages) {
    const manifest = readManifest(join(projectDir, 'node_modules', name, 'package.json'))
    if (!manifest) continue
    found = true
    if (name === '@astryxdesign/core') versions.core = String(manifest.version ?? '')
    if (name === '@astryxdesign/cli') versions.cli = String(manifest.version ?? '')
  }
  return found ? versions : { core: '', cli: '', source: 'none' }
}

function readDeclared(manifestPath, packages) {
  const manifest = readManifest(manifestPath)
  const versions = { core: '', cli: '', source: 'package.json' }
  if (!manifest) return { core: '', cli: '', source: 'none' }
  for (const block of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const name of packages) {
      const range = manifest[block]?.[name]
      if (typeof range !== 'string') continue
      const cleaned = range.replace(/^[\^~>=<]+/, '').trim()
      if (name === '@astryxdesign/core') versions.core = cleaned
      if (name === '@astryxdesign/cli') versions.cli = cleaned
    }
  }
  return versions.core || versions.cli ? versions : { core: '', cli: '', source: 'none' }
}

function readManifest(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}
