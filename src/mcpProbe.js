import { spawn } from 'node:child_process'
import { planSpawn } from './spawn.js'

const PROTOCOL_VERSION = '2024-11-05'

/**
 * One-shot MCP reachability check: initialize -> tools/list -> close.
 * Reports facts (tool count, latency, error), never a guess about health.
 */
export class McpProbe {
  constructor(options = {}) {
    this.spawnImpl = options.spawnImpl ?? spawn
    this.clientName = options.clientName ?? 'dsh-astryx'
    this.platform = options.platform ?? process.platform
  }

  async probe({ command, args = [], env = {}, timeoutMs = 8000, retries = 2 } = {}) {
    if (!command) return { ok: false, tools: [], latencyMs: 0, error: 'no command to probe' }
    let last = null
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      last = await this.once({ command, args, env, timeoutMs })
      if (last.ok) return last
      if (attempt < retries) await delay(300 * (attempt + 1))
    }
    return last
  }

  once({ command, args, env, timeoutMs }) {
    return new Promise((resolve) => {
      const started = Date.now()
      let child
      try {
        const plan = planSpawn({
          file: command,
          args,
          platform: this.platform,
          options: { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } },
        })
        child = this.spawnImpl(plan.file, plan.args, plan.options)
      } catch (error) {
        resolve({ ok: false, tools: [], latencyMs: 0, error: String(error?.message ?? error) })
        return
      }

      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          child.stdin.end()
        } catch {}
        try {
          child.kill('SIGKILL')
        } catch {}
        resolve({ ...value, latencyMs: Date.now() - started })
      }

      const timer = setTimeout(() => finish({ ok: false, tools: [], error: `timed out after ${timeoutMs}ms` }), timeoutMs)
      let buffer = ''

      const send = (message) => {
        try {
          child.stdin.write(`${JSON.stringify(message)}\n`)
        } catch (error) {
          finish({ ok: false, tools: [], error: String(error?.message ?? error) })
        }
      }

      child.on('error', (error) => finish({ ok: false, tools: [], error: String(error?.message ?? error) }))
      child.on('close', (code) => finish({ ok: false, tools: [], error: `server exited (${code}) before tools/list` }))
      child.stdout.on('data', (chunk) => {
        buffer += String(chunk)
        const parsed = readResponse(buffer)
        if (parsed) finish({ ok: true, tools: parsed, error: '' })
      })

      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: this.clientName, version: '1' } } })
      send({ jsonrpc: '2.0', method: 'notifications/initialized' })
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    })
  }
}

function readResponse(buffer) {
  const lines = buffer.split(/\r?\n/)
  for (const line of lines) {
    const text = line.trim()
    if (!text.startsWith('{')) continue
    let message
    try {
      message = JSON.parse(text)
    } catch {
      continue
    }
    if (message.id !== 2) continue
    if (message.error) throw new Error(`tools/list failed: ${message.error.message ?? 'unknown'}`)
    return (message.result?.tools ?? []).map((tool) => String(tool?.name ?? '')).filter(Boolean)
  }
  return null
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
