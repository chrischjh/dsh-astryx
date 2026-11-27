import { Contract } from './src/contract.js'
import { StatusCache } from './src/cache.js'
import { StatusService, formatStatus } from './src/status.js'
import { SelfCheck } from './src/selfcheck.js'
import { dshPaths } from './src/paths.js'

export const name = 'astryx'

export function apply(ctx, config = {}) {
  const settings = normalize(config)
  const paths = dshPaths()

  let contract
  try {
    contract = Contract.load()
  } catch (error) {
    ctx.logger?.warn?.(`[astryx] contract load failed: ${String(error?.message ?? error)}`)
    return
  }

  const status = new StatusService({
    contract,
    config: settings,
    cacheDir: paths.cache,
    defaultProjectPath: settings.projectPath,
  })
  const selfCheck = new SelfCheck({ contract, paths })

  const tools = ctx.get('tools')
  if (tools !== undefined) {
    ctx.effect(() => tools.register(statusTool(status, settings)), 'astryx status tool')
    ctx.effect(() => tools.register(selfCheckTool(selfCheck, settings)), 'astryx self-check tool')
  }

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt !== undefined) {
    ctx.effect(() => systemPrompt.section({
      name: 'astryx:compat',
      order: 3102,
      text: 'Astryx (@astryxdesign) work: call `astryx_status` before choosing versions, and `astryx_selfcheck` before claiming its MCP server or skill is set up. Never assume a component API from memory; read the CLI (`astryx component <Name>`, `astryx docs <topic>`).',
    }), 'astryx prompt section')
  }

  if (settings.checkOnStart) {
    ctx.effect(() => {
      const timer = setTimeout(() => {
        status.collect({ projectPath: settings.projectPath }).catch((error) => {
          ctx.logger?.warn?.(`[astryx] background check failed: ${String(error?.message ?? error)}`)
        })
      }, 5)
      timer.unref?.()
      return () => clearTimeout(timer)
    }, 'astryx warm check')
  }
}

function normalize(config) {
  const ttlHours = Number(config.ttlHours)
  return {
    ttlHours: Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 6,
    checkOnStart: config.checkOnStart !== false,
    registry: typeof config.registry === 'string' && config.registry ? config.registry : 'https://registry.npmjs.org',
    projectPath: typeof config.projectPath === 'string' ? config.projectPath : '',
  }
}

function statusTool(service, settings) {
  return {
    name: 'astryx_status',
    description: 'Astryx (@astryxdesign) release status: installed vs latest core/cli versions, whether an update is available, and whether the newest Astryx is still compatible with this plugin\'s declared support range (cached; pass refresh to re-check now).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        projectPath: { type: 'string', description: 'Directory to search upward for a package.json that uses @astryxdesign.' },
        refresh: { type: 'boolean', description: 'Bypass the cache and query the registry now.' },
      },
    },
    output: {
      schema: statusSchema(),
      render(args, value) {
        return [{ type: 'text', text: formatStatus(value) }]
      },
    },
    timeoutMs: 30000,
    presentCall() {
      return { card: 'generic', title: 'Astryx status', kind: 'read' }
    },
    async execute(args = {}, exec) {
      return await service.collect({
        projectPath: String(args.projectPath || settings.projectPath || process.cwd()),
        refresh: args.refresh === true,
        signal: exec?.signal,
      })
    },
  }
}

function selfCheckTool(selfCheck, settings) {
  return {
    name: 'astryx_selfcheck',
    description: 'Self-check the Astryx setup in DSH: is the dsh-astryx row active, are the required astryx CLI commands present, does a configured Astryx MCP server answer tools/list, and is the Astryx skill where DSH can load it. Read-only: it reports facts and failure codes, it repairs nothing.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        projectPath: { type: 'string', description: 'Project directory to check for @astryxdesign, its CLI and the project-level skill.' },
      },
    },
    output: {
      schema: selfCheckSchema(),
      render(args, value) {
        const lines = [
          `${value.ok ? 'ok' : `FAILED: ${value.failure.code}`}${value.failure.message ? ` — ${value.failure.message}` : ''}`,
          `plugin: row ${value.plugin.rowFound ? (value.plugin.rowDisabled ? 'disabled' : 'active') : 'missing'}, tool ${value.plugin.tool}`,
          `cli: ${value.cli.found ? `${value.cli.via} ${value.cli.version}` : 'not installed'}${value.cli.missing.length ? ` missing ${value.cli.missing.join(',')}` : ''}`,
          `mcp: configured=${value.mcp.configured} (${value.mcp.basis}) reachable=${value.mcp.reachable} tools=${value.mcp.toolsCount}${value.mcp.error ? ` error=${value.mcp.error}` : ''}`,
          `skill: ${value.skill.verdict}${value.skill.effectivePath ? ` (${value.skill.effectivePath})` : ''}`,
          `roots checked: ${value.skill.roots.join(', ') || '-'}`,
        ]
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    timeoutMs: 45000,
    presentCall() {
      return { card: 'generic', title: 'Astryx self-check', kind: 'read' }
    },
    async execute(args = {}) {
      const report = await selfCheck.run({ projectPath: String(args.projectPath || settings.projectPath || process.cwd()) })
      return { ...report, failure: { code: report.failure?.code ?? '', message: report.failure?.message ?? '' } }
    },
  }
}

function statusSchema() {
  const strings = { type: 'array', items: { type: 'string' } }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['checkedAt', 'fromCache', 'project', 'astryx', 'compat', 'probe', 'registry'],
    properties: {
      checkedAt: { type: 'string' },
      fromCache: { type: 'boolean' },
      project: {
        type: 'object', additionalProperties: false, required: ['path', 'found'],
        properties: { path: { type: 'string' }, found: { type: 'boolean' } },
      },
      astryx: {
        type: 'object', additionalProperties: false,
        required: ['installedCore', 'installedCli', 'installedSource', 'latestCore', 'latestCli', 'canaryCore', 'updateAvailable'],
        properties: {
          installedCore: { type: 'string' }, installedCli: { type: 'string' }, installedSource: { type: 'string' },
          latestCore: { type: 'string' }, latestCli: { type: 'string' }, canaryCore: { type: 'string' },
          updateAvailable: { type: 'boolean' },
        },
      },
      compat: {
        type: 'object', additionalProperties: false,
        required: ['pluginVersion', 'verdict', 'judgedAgainst', 'supportedCore', 'testedCore', 'reasons', 'actions'],
        properties: {
          pluginVersion: { type: 'string' }, verdict: { type: 'string' }, judgedAgainst: { type: 'string' },
          supportedCore: { type: 'string' }, testedCore: { type: 'string' },
          reasons: strings, actions: strings,
        },
      },
      probe: {
        type: 'object', additionalProperties: false, required: ['ran', 'via', 'version', 'missing', 'error'],
        properties: {
          ran: { type: 'boolean' }, via: { type: 'string' }, version: { type: 'string' },
          missing: strings, error: { type: 'string' },
        },
      },
      registry: {
        type: 'object', additionalProperties: false, required: ['ok', 'error'],
        properties: { ok: { type: 'boolean' }, error: { type: 'string' } },
      },
    },
  }
}

function selfCheckSchema() {
  const strings = { type: 'array', items: { type: 'string' } }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['checkedAt', 'ok', 'codes', 'plugin', 'cli', 'mcp', 'skill', 'project'],
    properties: {
      checkedAt: { type: 'string' },
      ok: { type: 'boolean' },
      codes: strings,
      plugin: {
        type: 'object', additionalProperties: false,
        required: ['rowId', 'rowFound', 'rowDisabled', 'tool', 'version'],
        properties: {
          rowId: { type: 'string' }, rowFound: { type: 'boolean' }, rowDisabled: { type: 'boolean' },
          tool: { type: 'string' }, version: { type: 'string' },
        },
      },
      cli: {
        type: 'object', additionalProperties: false, required: ['found', 'via', 'version', 'missing'],
        properties: {
          found: { type: 'boolean' }, via: { type: 'string' }, version: { type: 'string' }, missing: strings,
        },
      },
      mcp: {
        type: 'object', additionalProperties: false,
        required: ['configured', 'basis', 'transport', 'serverName', 'rowId', 'reachable', 'toolsCount', 'latencyMs', 'error'],
        properties: {
          configured: { type: 'boolean' }, basis: { type: 'string' }, transport: { type: 'string' },
          serverName: { type: 'string' }, rowId: { type: 'string' }, reachable: { type: 'boolean' },
          toolsCount: { type: 'number' }, latencyMs: { type: 'number' }, error: { type: 'string' },
        },
      },
      skill: {
        type: 'object', additionalProperties: false, required: ['verdict', 'effectivePath', 'roots', 'locations'],
        properties: {
          verdict: { type: 'string' }, effectivePath: { type: 'string' },
          roots: { type: 'array', items: { type: 'string' } },
          locations: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              required: ['id', 'path', 'visibleToDsh', 'scope', 'exists', 'valid', 'name', 'description', 'link', 'bytes'],
              properties: {
                id: { type: 'string' }, path: { type: 'string' }, visibleToDsh: { type: 'boolean' },
                scope: { type: 'string' },
                exists: { type: 'boolean' }, valid: { type: 'boolean' }, name: { type: 'string' },
                description: { type: 'string' }, link: { type: 'string' }, bytes: { type: 'number' },
              },
            },
          },
        },
      },
      project: {
        type: 'object', additionalProperties: false, required: ['path', 'astryxFound', 'agentsBlock'],
        properties: { path: { type: 'string' }, astryxFound: { type: 'boolean' }, agentsBlock: { type: 'boolean' } },
      },
      failure: {
        type: 'object', additionalProperties: false, required: ['code', 'message'],
        properties: { code: { type: 'string' }, message: { type: 'string' } },
      },
    },
  }
}
