// Vendors the computer-level Astryx skill into this plugin and pins its hash.
//   node scripts/sync-skill.mjs            copy from ~/.agents/skills/astryx
//   node scripts/sync-skill.mjs --verify   fail when the vendored file drifted
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const VENDORED = join(ROOT, 'skills', 'astryx', 'SKILL.md')
const LOCK = join(ROOT, 'skills.lock.json')
const SOURCE = join(homedir(), '.agents', 'skills', 'astryx', 'SKILL.md')
const verifyOnly = process.argv.includes('--verify')

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

if (verifyOnly) {
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'))
  const expected = lock.skills?.astryx?.sha256
  const actual = existsSync(VENDORED) ? sha256(VENDORED) : ''
  if (expected !== actual) {
    console.error(`vendored Astryx skill drifted: expected ${expected}, found ${actual}`)
    process.exit(1)
  }
  console.log(`vendored Astryx skill matches its lock (${actual.slice(0, 16)}…)`)
  process.exit(0)
}

if (!existsSync(SOURCE)) {
  console.error(`no Astryx skill at ${SOURCE}; run \`npm i -g @astryxdesign/cli\` (its postinstall writes it) first`)
  process.exit(1)
}
mkdirSync(dirname(VENDORED), { recursive: true })
copyFileSync(SOURCE, VENDORED)
const hash = sha256(VENDORED)
writeFileSync(LOCK, `${JSON.stringify({
  source: 'astryx CLI computer-level skill (astryx init --user)',
  syncedAt: new Date().toISOString().slice(0, 10),
  skills: { astryx: { path: 'skills/astryx/SKILL.md', sha256: hash } },
}, null, 2)}\n`)
console.log(`vendored skills/astryx/SKILL.md (${hash.slice(0, 16)}…)`)
