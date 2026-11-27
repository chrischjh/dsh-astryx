const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/
const COMPARATOR_RE = /^(>=|<=|>|<|=|\^)?(.+)$/

/** Minimal semver: enough for "is this Astryx release inside our support range". */
export class Semver {
  static parse(text) {
    const match = VERSION_RE.exec(String(text ?? '').trim())
    if (!match) return null
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      pre: match[4] ?? '',
    }
  }

  static compare(left, right) {
    const a = Semver.parse(left)
    const b = Semver.parse(right)
    if (!a || !b) throw new Error(`cannot compare "${left}" with "${right}"`)
    return compareParts(a, b)
  }

  static isPrerelease(text) {
    const parsed = Semver.parse(text)
    return Boolean(parsed?.pre)
  }

  static satisfies(version, range) {
    if (!Semver.parse(version) || typeof range !== 'string' || range.trim() === '') return false
    return range.trim().split(/\s+/).every((token) => matchesToken(version, token))
  }

  static highest(versions) {
    return versions
      .filter((version) => Semver.parse(version))
      .sort((a, b) => Semver.compare(a, b))
      .at(-1) ?? ''
  }
}

function compareParts(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1
  }
  return comparePre(a.pre, b.pre)
}

// A release sorts above any prerelease of the same numbers.
function comparePre(a, b) {
  if (a === b) return 0
  if (a === '') return 1
  if (b === '') return -1
  const left = a.split('.')
  const right = b.split('.')
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const one = left[index]
    const two = right[index]
    if (one === undefined) return -1
    if (two === undefined) return 1
    if (one === two) continue
    const numeric = !Number.isNaN(Number(one)) && !Number.isNaN(Number(two))
    if (numeric) return Number(one) < Number(two) ? -1 : 1
    if (!Number.isNaN(Number(one))) return -1
    if (!Number.isNaN(Number(two))) return 1
    return one < two ? -1 : 1
  }
  return 0
}

function matchesToken(version, token) {
  const match = COMPARATOR_RE.exec(token)
  if (!match) return false
  const operator = match[1] ?? '='
  const target = match[2].trim()
  if (!Semver.parse(target)) return false
  if (operator === '^') {
    const base = Semver.parse(target)
    return Semver.compare(version, target) >= 0
      && Semver.compare(version, `${base.major + 1}.0.0`) < 0
  }
  const order = Semver.compare(version, target)
  if (operator === '=') return order === 0
  if (operator === '>=') return order >= 0
  if (operator === '<=') return order <= 0
  if (operator === '>') return order > 0
  return order < 0
}
