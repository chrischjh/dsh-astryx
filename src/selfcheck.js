import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { McpProbe } from './mcpProbe.js'
import { PatchScan, discoverPatchFiles } from './patchScan.js'
import { ProjectProbe } from './project.js'
import { SkillCheck } from './skills.js'

/**
 * Self-check: are the pieces this plugin relies on actually working?
 * Facts only — registration, reachability, skill visibility, contract drift.
 */
export class SelfCheck {
  constructor(options) {
    this.contract = options.contract
    this.paths = options.paths
    this.makeProbe = options.makeProbe ?? ((startDir) => new ProjectProbe({ startDir }))
    this.makeMcp = options.makeMcp ?? (() => new McpProbe())
    this.makePatchScan = options.makePatchScan ?? (() => new PatchScan({
      files: this.paths.patchFiles?.length ? this.paths.patchFiles : discoverPatchFiles({ profileDir: this.paths.profileDir, home: this.paths.home }),
    }))
    this.makeSkillCheck = options.makeSkillCheck ?? ((projectDir) => new SkillCheck({
      dshSkills: this.paths.skills,
      agentsSkills: this.paths.agentsSkills,
      projectDir,
    }))
    this.now = options.now ?? (() => new Date())
  }

  async run({ projectPath = process.cwd() } = {}) {
    const probe = this.makeProbe(projectPath)
    const project = probe.locate()
    const installed = probe.installed(project.dir)
    const candidates = probe.cliCandidates(project.dir)
    const cli = await this.#cliFacts(probe, project, installed, candidates)
    const patch = this.makePatchScan()
    const plugin = this.#pluginFacts(patch)
    const mcp = await this.#mcpFacts(patch, candidates, project)
    const skill = this.makeSkillCheck(project.dir).inspect()
    const code = this.#verdict({ plugin, cli, mcp, skill })

    return {
      checkedAt: this.now().toISOString(),
      ok: code === null,
      codes: code ? [code.code] : [],
      plugin,
      cli,
      mcp,
      skill,
      project: {
        path: project.dir ?? '',
        astryxFound: project.found,
        agentsBlock: hasAgentsBlock(project.dir),
      },
      failure: code,
    }
  }

  async #cliFacts(probe, project, installed, candidates) {
    const found = Boolean(installed.cli) || candidates.length > 0
    if (!found || candidates.length === 0) {
      return { found, via: found ? String(installed.source) : 'none', version: String(installed.cli ?? ''), missing: [] }
    }
    const raw = await probe.runCli({ projectDir: project.dir })
    const missing = this.contract.requiredCommands.filter((command) => !raw.commands.includes(command))
    return { found: true, via: String(raw.via ?? 'none'), version: String(raw.version || installed.cli || ''), missing }
  }

  #pluginFacts(patch) {
    const row = patch.byId('dsh-astryx')
    return {
      rowId: 'dsh-astryx',
      rowFound: Boolean(row),
      rowDisabled: Boolean(row?.disabled),
      tool: 'callable',
      version: this.contract.pluginVersion,
    }
  }

  async #mcpFacts(patch, candidates, project) {
    const rows = patch.mcpRowsFor('astryx')
    const active = rows.find((row) => !row.disabled) ?? null
    if (active) {
      const base = {
        configured: true,
        basis: 'dsh-row',
        transport: String(active.transport || (active.command ? 'stdio' : 'http')),
        serverName: String(active.serverName ?? ''),
        rowId: String(active.id ?? ''),
        reachable: false,
        toolsCount: 0,
        latencyMs: 0,
        error: '',
      }
      if (!active.command) {
        return { ...base, error: `configured over ${base.transport}; not probed` }
      }
      const result = await this.makeMcp().probe({ command: active.command, args: splitArgs(active.args) })
      return { ...base, reachable: result.ok, toolsCount: result.tools.length, latencyMs: result.latencyMs, error: result.error }
    }

    const rowsDisabled = rows.length > 0
    const local = this.#localMcpCommand(candidates)
    if (!local) {
      return { configured: false, basis: rowsDisabled ? 'disabled-row' : 'none', transport: '', serverName: '', rowId: rowsDisabled ? String(rows[0].id) : '', reachable: false, toolsCount: 0, latencyMs: 0, error: '' }
    }
    const result = await this.makeMcp().probe(local)
    return {
      configured: false,
      basis: 'local-cli',
      transport: 'stdio',
      serverName: '',
      rowId: '',
      reachable: result.ok,
      toolsCount: result.tools.length,
      latencyMs: result.latencyMs,
      error: result.error,
    }
  }

  #localMcpCommand(candidates) {
    const candidate = candidates[0]
    if (!candidate) return null
    const args = candidate.file === process.execPath ? [candidate.args[0], 'mcp'] : ['mcp']
    return { command: candidate.file, args }
  }

  #verdict({ plugin, cli, mcp, skill }) {
    if (!plugin.rowFound) return { code: 'plugin-row-missing', message: 'dsh-astryx row is not in the applied patch layers' }
    if (plugin.rowDisabled) return { code: 'plugin-row-disabled', message: 'dsh-astryx row is disabled in a patch layer' }
    if (mcp.configured && !mcp.reachable) return { code: 'mcp-unreachable', message: mcp.error || 'configured Astryx MCP server did not answer tools/list' }
    if (skill.verdict === 'invalid') return { code: 'skill-invalid', message: 'an Astryx SKILL.md exists but its frontmatter lacks name/description' }
    if (cli.missing.length > 0) return { code: 'contract-drift', message: `CLI is missing ${cli.missing.join(', ')}` }
    return null
  }
}

function hasAgentsBlock(projectDir) {
  if (!projectDir) return false
  const path = join(projectDir, 'AGENTS.md')
  if (!existsSync(path)) return false
  try {
    return readFileSync(path, 'utf8').includes('ASTRYX:')
  } catch {
    return false
  }
}

function splitArgs(text) {
  if (typeof text !== 'string' || text.trim() === '') return []
  return text.split(',').map((part) => part.trim()).filter(Boolean)
}
