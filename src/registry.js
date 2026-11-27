const DEFAULT_PACKAGES = { core: '@astryxdesign/core', cli: '@astryxdesign/cli' }

/** Reads npm dist-tags. Network failures stay data, never thrown at the tool. */
export class RegistryClient {
  constructor(options = {}) {
    this.registry = String(options.registry ?? 'https://registry.npmjs.org').replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.timeoutMs = Number(options.timeoutMs ?? 5000)
    this.packages = options.packages ?? DEFAULT_PACKAGES
  }

  async versions({ signal } = {}) {
    const result = { core: null, cli: null, ok: true, error: '' }
    for (const [key, pkg] of Object.entries(this.packages)) {
      try {
        result[key] = await this.distTags(pkg, { signal })
      } catch (error) {
        result.ok = false
        result.error = result.error || `${pkg}: ${errorText(error)}`
      }
    }
    return result
  }

  async distTags(pkg, { signal } = {}) {
    if (typeof this.fetchImpl !== 'function') throw new Error('no fetch available')
    const url = `${this.registry}/-/package/${encodeURIComponent(pkg)}/dist-tags`
    const response = await this.fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: withTimeout(signal, this.timeoutMs),
    })
    if (!response.ok) throw new Error(`registry answered ${response.status}`)
    return await response.json()
  }
}

function withTimeout(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

function errorText(error) {
  return String(error?.message ?? error)
}
