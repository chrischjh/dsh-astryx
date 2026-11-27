import { formatStatus } from './status.js'
import { setupText } from './setup.js'

/** The three read-only tools the agent calls. Registration lives in index.js. */
export function createTools({ status, selfCheck, setup, settings }) {
  return [
    statusTool(status, settings),
    setupTool(setup, settings),
    selfCheckTool(selfCheck, settings),
  ]
}

function statusTool(service, settings) {
  return {
    name: 'astryx_status',
    description: 'Astryx (@astryxdesign) release status: installed vs latest core/cli versions, whether an update is available, and whether the newest Astryx is still compatible with this plugin\'s declared support range (cached; pass refresh to re-check now).',
    parameters: objectSchema({ projectPath: pathParam(), refresh: { type: 'boolean', description: 'Bypass the cache and query the registry now.' } }),
    output: { schema: statusSchema(), render: (args, value) => text(formatStatus(value)) },
    timeoutMs: 30000,
    presentCall: () => ({ card: 'generic', title: 'Astryx status', kind: 'read' }),
    async execute(args = {}, exec) {
      return await service.collect({
        projectPath: String(args.projectPath || settings.projectPath || process.cwd()),
        refresh: args.refresh === true,
        signal: exec?.signal,
      })
    },
  }
}

function setupTool(check, settings) {
  return {
    name: 'astryx_setup',
    description: 'Whether this project can build UI with Astryx right now: React 19, @astryxdesign/core, a theme package, the astryx CLI, the ASTRYX agent-docs block, and the loaded Astryx skill — each with the exact command that fixes a gap. Read-only.',
    parameters: objectSchema({ projectPath: pathParam() }),
    output: { schema: setupSchema(), render: (args, value) => text(setupText(value)) },
    timeoutMs: 20000,
    presentCall: () => ({ card: 'generic', title: 'Astryx setup', kind: 'read' }),
    async execute(args = {}) {
      return check.run({ projectPath: String(args.projectPath || settings.projectPath || process.cwd()) })
    },
  }
}

function selfCheckTool(selfCheck, settings) {
  return {
    name: 'astryx_selfcheck',
    description: 'Self-check the Astryx setup in DSH: is the dsh-astryx row active, are the required astryx CLI commands present, does a configured Astryx MCP server answer tools/list, and is the Astryx skill where DSH can load it. Read-only: it reports facts and failure codes, it repairs nothing.',
    parameters: objectSchema({ projectPath: pathParam() }),
    output: { schema: selfCheckSchema(), render: (args, value) => text(selfCheckText(value)) },
    timeoutMs: 45000,
    presentCall: () => ({ card: 'generic', title: 'Astryx self-check', kind: 'read' }),
    async execute(args = {}) {
      const report = await selfCheck.run({ projectPath: String(args.projectPath || settings.projectPath || process.cwd()) })
      return { ...report, failure: { code: report.failure?.code ?? '', message: report.failure?.message ?? '' } }
    },
  }
}

function text(body) {
  return [{ type: 'text', text: body }]
}

function pathParam() {
  return { type: 'string', description: 'Project directory to check; defaults to the plugin config or the working directory.' }
}

function objectSchema(properties) {
  return { type: 'object', additionalProperties: false, properties }
}

function strings() {
  return { type: 'array', items: { type: 'string' } }
}

export function selfCheckText(value) {
  return [
    `${value.ok ? 'ok' : `FAILED: ${value.failure.code}`}${value.failure.message ? ` — ${value.failure.message}` : ''}`,
    `plugin: row ${value.plugin.rowFound ? (value.plugin.rowDisabled ? 'disabled' : 'active') : 'missing'}, tool ${value.plugin.tool}`,
    `cli: ${value.cli.found ? `${value.cli.via} ${value.cli.version}` : 'not installed'}${value.cli.missing.length ? ` missing ${value.cli.missing.join(',')}` : ''}`,
    `mcp: configured=${value.mcp.configured} (${value.mcp.basis}) reachable=${value.mcp.reachable} tools=${value.mcp.toolsCount}${value.mcp.error ? ` error=${value.mcp.error}` : ''}`,
    `skill: ${value.skill.verdict}${value.skill.effectivePath ? ` (${value.skill.effectivePath})` : ''}`,
    `roots checked: ${value.skill.roots.join(', ') || '-'}`,
  ].join('\n')
}

function statusSchema() {
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
          supportedCore: { type: 'string' }, testedCore: { type: 'string' }, reasons: strings(), actions: strings(),
        },
      },
      probe: {
        type: 'object', additionalProperties: false, required: ['ran', 'via', 'version', 'missing', 'error'],
        properties: { ran: { type: 'boolean' }, via: { type: 'string' }, version: { type: 'string' }, missing: strings(), error: { type: 'string' } },
      },
      registry: {
        type: 'object', additionalProperties: false, required: ['ok', 'error'],
        properties: { ok: { type: 'boolean' }, error: { type: 'string' } },
      },
    },
  }
}

function setupSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['ready', 'project', 'checks', 'skillVerdict'],
    properties: {
      ready: { type: 'boolean' },
      skillVerdict: { type: 'string' },
      project: {
        type: 'object', additionalProperties: false, required: ['path', 'found'],
        properties: { path: { type: 'string' }, found: { type: 'boolean' } },
      },
      checks: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['id', 'ok', 'detail', 'action'],
          properties: { id: { type: 'string' }, ok: { type: 'boolean' }, detail: { type: 'string' }, action: { type: 'string' } },
        },
      },
    },
  }
}

function selfCheckSchema() {
  return {
    type: 'object', additionalProperties: false,
    required: ['checkedAt', 'ok', 'codes', 'plugin', 'cli', 'mcp', 'skill', 'project', 'failure'],
    properties: {
      checkedAt: { type: 'string' },
      ok: { type: 'boolean' },
      codes: strings(),
      plugin: {
        type: 'object', additionalProperties: false, required: ['rowId', 'rowFound', 'rowDisabled', 'tool', 'version'],
        properties: { rowId: { type: 'string' }, rowFound: { type: 'boolean' }, rowDisabled: { type: 'boolean' }, tool: { type: 'string' }, version: { type: 'string' } },
      },
      cli: {
        type: 'object', additionalProperties: false, required: ['found', 'via', 'version', 'missing'],
        properties: { found: { type: 'boolean' }, via: { type: 'string' }, version: { type: 'string' }, missing: strings() },
      },
      mcp: {
        type: 'object', additionalProperties: false,
        required: ['configured', 'basis', 'transport', 'serverName', 'rowId', 'reachable', 'toolsCount', 'latencyMs', 'error'],
        properties: {
          configured: { type: 'boolean' }, basis: { type: 'string' }, transport: { type: 'string' }, serverName: { type: 'string' },
          rowId: { type: 'string' }, reachable: { type: 'boolean' }, toolsCount: { type: 'number' }, latencyMs: { type: 'number' }, error: { type: 'string' },
        },
      },
      skill: {
        type: 'object', additionalProperties: false, required: ['verdict', 'effectivePath', 'roots', 'locations'],
        properties: {
          verdict: { type: 'string' }, effectivePath: { type: 'string' }, roots: strings(),
          locations: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              required: ['id', 'path', 'visibleToDsh', 'scope', 'exists', 'valid', 'name', 'description', 'link', 'bytes'],
              properties: {
                id: { type: 'string' }, path: { type: 'string' }, visibleToDsh: { type: 'boolean' }, scope: { type: 'string' },
                exists: { type: 'boolean' }, valid: { type: 'boolean' }, name: { type: 'string' }, description: { type: 'string' },
                link: { type: 'string' }, bytes: { type: 'number' },
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
