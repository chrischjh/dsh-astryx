import { StatusCache } from './cache.js'
import { CompatJudge } from './compat.js'
import { RegistryClient } from './registry.js'
import { ProjectProbe } from './project.js'

/** Assembles the update + compatibility report the `astryx_status` tool returns. */
export class StatusService {
  constructor(options) {
    this.contract = options.contract
    this.config = options.config
    this.judge = new CompatJudge(this.contract)
    this.cache = options.cache ?? new StatusCache({ dir: options.cacheDir ?? '' })
    this.makeRegistry = options.makeRegistry ?? (() => new RegistryClient({ registry: this.config.registry }))
    this.makeProbe = options.makeProbe ?? ((startDir) => new ProjectProbe({ startDir }))
    this.now = options.now ?? (() => new Date())
    this.defaultProjectPath = options.defaultProjectPath || process.cwd()
  }

  async collect({ projectPath = this.defaultProjectPath, refresh = false, signal } = {}) {
    const ttlMs = this.config.ttlHours * 3600 * 1000
    if (!refresh) {
      const cached = this.cache.read({ ttlMs, now: this.now().getTime() })
      if (cached) return { ...cached, fromCache: true }
    }

    const probe = this.makeProbe(projectPath)
    const project = probe.locate()
    const installed = probe.installed(project.dir)
    const registry = await this.makeRegistry().versions({ signal })

    const latest = {
      core: String(registry.core?.latest ?? ''),
      cli: String(registry.cli?.latest ?? ''),
      canary: String(registry.core?.canary ?? ''),
    }

    const cliProbe = await this.#probeCli(probe, project, installed)
    const verdict = this.judge.judge({ latest, installed, probe: cliProbe, registryOk: registry.ok })

    const result = {
      checkedAt: this.now().toISOString(),
      fromCache: false,
      project: { path: project.dir ?? '', found: project.found },
      astryx: {
        installedCore: String(installed.core ?? ''),
        installedCli: String(installed.cli ?? ''),
        installedSource: String(installed.source ?? 'none'),
        latestCore: latest.core,
        latestCli: latest.cli,
        canaryCore: latest.canary,
        updateAvailable: Boolean(latest.core) && Boolean(installed.core) && String(installed.core) !== latest.core,
      },
      compat: {
        pluginVersion: this.contract.pluginVersion,
        verdict: verdict.verdict,
        judgedAgainst: verdict.target,
        supportedCore: this.contract.range('core'),
        testedCore: this.contract.tested('core'),
        reasons: verdict.reasons,
        actions: verdict.actions,
      },
      probe: {
        ran: Boolean(cliProbe.ran),
        via: String(cliProbe.via ?? 'none'),
        version: String(cliProbe.version ?? ''),
        missing: Array.isArray(cliProbe.missing) ? cliProbe.missing : [],
        error: String(cliProbe.error ?? ''),
      },
      registry: { ok: Boolean(registry.ok), error: String(registry.error ?? '') },
    }

    this.cache.write(result)
    return result
  }

  async #probeCli(probe, project, installed) {
    const cliAvailable = Boolean(installed.cli) || probe.cliCandidates(project.dir).length > 0
    if (!cliAvailable) return { ran: false, via: 'none', version: '', commands: [], initFlags: '', error: '' }
    const raw = await probe.runCli({ projectDir: project.dir })
    const missing = []
    for (const command of this.contract.requiredCommands) {
      if (!raw.commands.includes(command)) missing.push(`command:${command}`)
    }
    for (const flag of this.contract.requiredInitFlags) {
      if (!raw.initFlags.includes(flag)) missing.push(`init:${flag}`)
    }
    return { ...raw, missing }
  }
}

/** Human-facing one-screen summary for the tool renderer. */
export function formatStatus(status) {
  const lines = []
  const { astryx, compat, project, probe } = status
  const where = project.found ? project.path : '(no Astryx project here)'
  lines.push(`Astryx project: ${where}`)
  lines.push(`installed: core ${astryx.installedCore || '-'} / cli ${astryx.installedCli || '-'} (${astryx.installedSource})`)
  lines.push(`latest: core ${astryx.latestCore || '-'} / cli ${astryx.latestCli || '-'}${astryx.canaryCore ? ` / canary ${astryx.canaryCore}` : ''}`)
  lines.push(`update available: ${astryx.updateAvailable ? 'yes' : 'no'}`)
  lines.push(`compat: ${compat.verdict} (dsh-astryx ${compat.pluginVersion}, supports ${compat.supportedCore})`)
  lines.push(`probe: ${probe.ran ? `${probe.via} ${probe.version}` : 'not run'}${probe.missing.length ? ` missing ${probe.missing.join(',')}` : ''}`)
  return lines.join('\n')
}
