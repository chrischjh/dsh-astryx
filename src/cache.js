import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Small on-disk cache so activation and tool calls do not hit npm every time. */
export class StatusCache {
  constructor({ dir, fileName = 'status.json' } = {}) {
    this.dir = dir ?? ''
    this.path = this.dir ? join(this.dir, fileName) : ''
  }

  read({ ttlMs, now = Date.now() }) {
    if (!this.path) return null
    try {
      const payload = JSON.parse(readFileSync(this.path, 'utf8'))
      const checkedAt = Date.parse(payload?.checkedAt ?? '')
      if (!Number.isFinite(checkedAt)) return null
      if (now - checkedAt > ttlMs) return null
      return payload
    } catch {
      return null
    }
  }

  write(payload) {
    if (!this.path) return false
    try {
      mkdirSync(this.dir, { recursive: true })
      const temporary = `${this.path}.${process.pid}.tmp`
      writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`)
      renameSync(temporary, this.path)
      return true
    } catch {
      return false
    }
  }
}
