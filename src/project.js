import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const DEFAULT_PACKAGES = ['@astryxdesign/core', '@astryxdesign/cli']
const MAX_JSON_BYTES = 4 * 1024 * 1024

/** Finds a project that uses Astryx, reads its installed versions, and probes its CLI. */
export class ProjectProbe {
  constructor(options = {}) {
    this.startDir = resolve(options.startDir ?? process.cwd())
    this.spawnImpl = options.spawnImpl ?? spawn
    this.packages = options.packages ?? DEFAULT_PACKAGES
    this.cliPackage = options.cliPackage ?? '@astryxdesign/cli'
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
    const fromManifest = readDeclared(join(projectDir, 'package.json'), this.packages)
    Object.assign(versions, fromManifest)
    return versions
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
    return { ran: false, via: lastVia, version: '', commands: [], initFlags: [], error: lastError }
  }

  cliCandidates(projectDir) {
    const candidates = []
    const localBin = join(projectDir ?? '', 'node_modules', this.cliPackage, 'clients', 'cli', 'bin', 'astryx.mjs')
    if (projectDir && existsSync(localBin)) {
      candidates.push({ via: 'project-cli', file: process.execPath, args: [localBin, 'manifest', '--json'] })
    }
    const names = process.platform === 'win32' ? ['astryx.cmd', 'astryx'] : ['astryx']
    const found = findOnPath(names)
    if (found) candidates.push({ via: 'global-cli', file: found, args: ['manifest', '--json'] })
    return candidates
  }

  run(candidate, timeoutMs) {
    return new Promise((resolvePromise, reject) => {
      const child = this.spawnImpl(candidate.file, candidate.args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
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

function parseManifest(stdout) {
  let json
  try {
    json = JSON.parse(stdout)
  } catch {
    return null
  }
  const commands = collectNames(json?.commands)
  const initFlags = collectInitFlags(json)
  return { version: String(json?.version ?? ''), commands, initFlags }
}

function collectNames(list, names = []) {
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
  const text = flags.join(' ')
  if (text.includes('--to')) return '--to'
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
  if (Array.isArray(manifest.workspaces)) return false
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
  const any = versions.core || versions.cli
  return any ? versions : { core: '', cli: '', source: 'none' }
}

function readManifest(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function findOnPath(names) {
  const dirs = String(process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')
  for (const dir of dirs) {
    if (!dir) continue
    for (const name of names) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return candidate
    }
  }
  return ''
}
