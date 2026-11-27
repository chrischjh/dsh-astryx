import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Semver } from './semver.js'

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * What this plugin promises about Astryx: the version range it supports and the
 * CLI surface it tells agents to use. compat.json is the single source; bumping
 * support is a data change, not a code change.
 */
export class Contract {
  static load(root = PACKAGE_ROOT) {
    const meta = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const data = JSON.parse(readFileSync(join(root, 'compat.json'), 'utf8'))
    return new Contract(data, meta.version)
  }

  constructor(data = {}, pluginVersion = '0.0.0') {
    this.pluginVersion = pluginVersion
    this.supported = data.supported ?? {}
    this.testedAgainst = data.testedAgainst ?? {}
    this.requiredCommands = data.requiredCommands ?? []
    this.requiredInitFlags = data.requiredInitFlags ?? []
  }

  supports(pkg, version) {
    const range = this.supported[pkg]
    return Boolean(range) && Boolean(version) && Semver.satisfies(version, range)
  }

  range(pkg) {
    return this.supported[pkg] ?? ''
  }

  tested(pkg) {
    return this.testedAgainst[pkg] ?? ''
  }

  /** True when a version is newer than anything this plugin has been verified against. */
  isUntested(version, pkg) {
    const tested = this.tested(pkg)
    if (!Semver.parse(version) || !Semver.parse(tested)) return false
    return Semver.compare(version, tested) > 0
  }
}
