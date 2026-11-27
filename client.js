// dsh-astryx · browser half.
//
// One section on this bundle's Plugins detail page with three read-only cards:
//   开发就绪 (setup)   → POST /dsh-astryx/setup
//   版本与兼容 (status) → POST /dsh-astryx/status
//   接线自检 (selfcheck) → POST /dsh-astryx/selfcheck
// Each card renders the report the corresponding agent tool returns.

window.__ModuleLoader__.load({
  id: 'dsh-astryx',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const PACKAGE = 'dsh-astryx'
    const NS = 'dsh-astryx'
    const BASE = '/dsh-astryx'

    const DICT = {
      zh: {
        'section.title': 'Astryx 前端助手',
        'section.desc': '装上即具备 Astryx 知识与用法：内置 Astryx 技能（build → template → component 工作流与命名约定），并在提示中确立"先查 CLI、不凭记忆写 API"的专家姿态。下面三张卡是它的保障层，全部只读。',
        'setup.title': '开发就绪',
        'setup.desc': '开工前体检：React 19、core、主题包、CLI、AGENTS 指南块、已加载的 Astryx 技能。',
        'status.title': '版本与兼容',
        'status.desc': '已装 vs npm 最新，并判断最新版是否仍在本插件支持范围内。',
        'selfcheck.title': '接线自检',
        'selfcheck.desc': '插件行、CLI 命令面、Astryx MCP 握手、技能是否落在 DSH 会加载的目录。',
        'button.run': '立即检查',
        'button.again': '再查一次',
        'button.running': '检查中…',
        'ready.yes': '就绪：可以在本目录用 Astryx 写界面',
        'ready.no': '尚未就绪：按下面缺失项补',
        'skill.effective': 'Astryx 技能已加载：{path}',
        'skill.missing': 'Astryx 技能未加载',
        'fail': '检查失败：{message}',
        'empty': '点击"立即检查"读取当前状态。',
      },
      en: {
        'section.title': 'Astryx frontend assistant',
        'section.desc': 'Enabling this plugin gives the agent Astryx expertise: the bundled Astryx skill (build → template → component workflow and naming rules) plus a prompt posture that says look it up instead of recalling APIs. The three cards below are the safety net; all read-only.',
        'setup.title': 'Project readiness',
        'setup.desc': 'Before the first page: React 19, core, a theme package, the CLI, the ASTRYX agent-docs block, and the loaded Astryx skill.',
        'status.title': 'Releases & compatibility',
        'status.desc': 'Installed vs the newest npm release, and whether the newest still fits this plugin\'s support range.',
        'selfcheck.title': 'Wiring self-check',
        'selfcheck.desc': 'The plugin row, the CLI surface, an Astryx MCP handshake, and whether the skill sits in a DSH-loaded directory.',
        'button.run': 'Check now',
        'button.again': 'Check again',
        'button.running': 'Checking…',
        'ready.yes': 'Ready: this project can build UI with Astryx',
        'ready.no': 'Not ready yet: fix the missing rows below',
        'skill.effective': 'Astryx skill loaded: {path}',
        'skill.missing': 'Astryx skill not loaded',
        'fail': 'Check failed: {message}',
        'empty': 'Press "Check now" to read the current state.',
      },
    }

    const styles = {
      wrap: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' },
      head: { display: 'flex', flexDirection: 'column', gap: '4px' },
      title: { fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      desc: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)', margin: 0 },
      card: {
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 'var(--dsw-radius-sm, 8px)',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      },
      cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
      cardTitle: { fontSize: '12px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      button: {
        fontSize: '12px',
        padding: '4px 10px',
        borderRadius: 'var(--dsw-radius-sm, 6px)',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-l1, transparent)',
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
      },
      line: { fontSize: '12px', lineHeight: '19px', color: 'var(--dsw-alias-label-secondary)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap' },
      bad: { color: 'var(--dsw-alias-state-error-primary)' },
      error: { fontSize: '12px', color: 'var(--dsw-alias-state-error-primary)', margin: 0 },
    }

    function format(template, params) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) => (params && params[key] !== undefined ? String(params[key]) : match))
    }

    async function post(action) {
      const response = await fetch(`${BASE}/${action}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: '{}',
      })
      const payload = await response.json().catch(() => undefined)
      if (!response.ok) {
        const failure = payload && payload.failure
        throw new Error(failure ? `${failure.code}: ${failure.message}` : `HTTP ${response.status}`)
      }
      return payload.report
    }

    function setupLines(report) {
      return [
        report.ready ? 'ready' : 'not ready',
        `project: ${report.project.path || '-'}`,
        ...report.checks.map((check) => `${check.ok ? 'ok  ' : 'MISS'} ${check.id}: ${check.detail}${check.ok || !check.action ? '' : ` → ${check.action}`}`),
      ]
    }

    function statusLines(report) {
      const lines = [
        `compat: ${report.compat.verdict} (${report.compat.pluginVersion}, supports ${report.compat.supportedCore})`,
        `installed: core ${report.astryx.installedCore || '-'} / cli ${report.astryx.installedCli || '-'}`,
        `latest: core ${report.astryx.latestCore || '-'} / cli ${report.astryx.latestCli || '-'}`,
        `update available: ${report.astryx.updateAvailable ? 'yes' : 'no'}`,
        ...report.compat.reasons.filter(Boolean),
        ...report.compat.actions.filter(Boolean).map((action) => `→ ${action}`),
      ]
      if (report.registry.ok === false) lines.push(`registry: ${report.registry.error}`)
      return lines
    }

    function selfCheckLines(report) {
      const lines = [
        report.ok ? 'ok' : `FAILED: ${report.failure.code}${report.failure.message ? ` — ${report.failure.message}` : ''}`,
        `plugin: row ${report.plugin.rowFound ? (report.plugin.rowDisabled ? 'disabled' : 'active') : 'missing'}`,
        `cli: ${report.cli.found ? `${report.cli.via} ${report.cli.version}` : 'not installed'}`,
        `mcp: configured=${report.mcp.configured} reachable=${report.mcp.reachable} tools=${report.mcp.toolsCount}${report.mcp.error ? ` error=${report.mcp.error}` : ''}`,
        `skill: ${report.skill.verdict}`,
      ]
      return lines
    }

    function createCard(t, action, toLines) {
      return function Card() {
        const [running, setRunning] = React.useState(false)
        const [lines, setLines] = React.useState(undefined)
        const [error, setError] = React.useState(undefined)

        async function run() {
          setRunning(true)
          setError(undefined)
          try {
            const report = await post(action)
            setLines(toLines(report))
          } catch (failure) {
            setError(format(t('fail'), { message: failure && failure.message ? failure.message : String(failure) }))
          } finally {
            setRunning(false)
          }
        }

        const title = t(`${action}.title`)
        const desc = t(`${action}.desc`)
        return h('div', { style: styles.card },
          h('div', { style: styles.cardHead },
            h('div', { style: styles.cardTitle }, title),
            h('button', { type: 'button', style: styles.button, disabled: running, onClick: run },
              running ? t('button.running') : lines === undefined ? t('button.run') : t('button.again')),
          ),
          h('p', { style: styles.desc }, desc),
          error !== undefined ? h('p', { style: styles.error }, error) : null,
          lines === undefined ? h('div', { style: styles.line }, t('empty')) : lines.map((line, index) => h('div', { key: index, style: { ...styles.line, ...(line.startsWith('MISS') || line.startsWith('FAILED') ? styles.bad : {}) } }, line)),
        )
      }
    }

    function createSection(ctx) {
      return function AstryxPanel(props) {
        const subject = props && props.subject
        const visible = subject !== undefined && subject.kind === 'bundle' && subject.pkg !== undefined && subject.pkg.name === PACKAGE
        const [active, setActive] = React.useState(() => (ctx.locale && typeof ctx.locale.getSnapshot === 'function' ? ctx.locale.getSnapshot().active : 'zh'))
        React.useEffect(() => {
          if (!ctx.locale || typeof ctx.locale.subscribe !== 'function') return undefined
          return ctx.locale.subscribe(() => setActive(ctx.locale.getSnapshot().active))
        }, [])
        if (!visible) return null
        // Re-create the cards when the locale changes so labels refresh.
        const t = (key) => ctx.locale.bind(NS)(key)
        const Setup = createCard(t, 'setup', setupLines)
        const Status = createCard(t, 'status', statusLines)
        const SelfCheck = createCard(t, 'selfcheck', selfCheckLines)
        return h('div', { style: styles.wrap },
          h('div', { style: styles.head },
            h('div', { style: styles.title }, t('section.title')),
            h('p', { style: styles.desc }, t('section.desc')),
          ),
          h(Setup, { key: `setup-${active}` }),
          h(Status, { key: `status-${active}` }),
          h(SelfCheck, { key: `selfcheck-${active}` }),
        )
      }
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: DICT.zh, en: DICT.en }))
      ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({
        name: 'plugins.detail.section',
        id: 'dsh-astryx-panel',
        order: 20,
        label: () => ctx.locale.bind(NS)('section.title'),
      }, createSection(ctx)))
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
