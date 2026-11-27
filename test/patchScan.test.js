import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { discoverPatchFiles, parseRows, PatchScan } from '../src/patchScan.js'

const HOME_PATCH = `
- insert:
    - id: mcp-codegraph
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: codegraph
        transport: stdio
        command: /opt/homebrew/bin/codegraph
        args:
          - serve
          - --mcp
    - id: mcp-astryx
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: astryx
        transport: stdio
        command: /usr/local/bin/astryx
- id: dsh-astryx
  disabled: false
  config:
    ttlHours: 6
`

test('parses insert rows, names, and mcp config', () => {
  const rows = parseRows(HOME_PATCH, 'home')
  assert.equal(rows.length, 3)
  const astryxMcp = rows.find((row) => row.id === 'mcp-astryx')
  assert.equal(astryxMcp.name, '@deepseek-ai/dsh-mcp-client')
  assert.equal(astryxMcp.serverName, 'astryx')
  assert.equal(astryxMcp.command, '/usr/local/bin/astryx')
  assert.equal(astryxMcp.transport, 'stdio')
})

test('finds the plugin row and its disabled flag', () => {
  const rows = parseRows('- id: dsh-astryx\n  disabled: true\n', 'profile')
  assert.equal(rows[0].id, 'dsh-astryx')
  assert.equal(rows[0].disabled, true)
})

test('mcpRowsFor matches server name or command', () => {
  const rows = parseRows(HOME_PATCH, 'home')
  const direct = rows.filter((row) => row.name === '@deepseek-ai/dsh-mcp-client')
  assert.equal(direct.length, 2)
  const astryxOnly = direct.filter((row) => `${row.serverName} ${row.command}`.toLowerCase().includes('astryx'))
  assert.equal(astryxOnly.length, 1)
})

test('a missing patch file contributes no rows', () => {
  const scan = new PatchScan({ files: ['/nonexistent/cordis.patch.yml'] })
  assert.deepEqual(scan.rows(), [])
  assert.equal(scan.byId('dsh-astryx'), null)
})

test('later layers win when two layers declare the same row id', () => {
  const rows = [
    ...parseRows('- insert:\n    - id: dsh-astryx\n      name: dsh-astryx\n', 'bundle'),
    ...parseRows('- id: dsh-astryx\n  disabled: true\n', 'profile'),
  ]
  const scan = new PatchScan({ files: [] })
  scan.rows = () => rows
  assert.equal(scan.byId('dsh-astryx').disabled, true)
})

test('discoverPatchFiles orders bundle patches before profile and home', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-astryx-layers-'))
  const profileDir = join(root, 'profiles', 'desktop')
  mkdirSync(join(profileDir, 'node_modules', '@scope', 'bundle'), { recursive: true })
  writeFileSync(join(profileDir, 'node_modules', '@scope', 'bundle', 'cordis.patch.yml'), '- insert:\n    - id: dsh-astryx\n')
  writeFileSync(join(profileDir, 'cordis.patch.yml'), '- id: dsh-astryx\n  disabled: true\n')
  mkdirSync(join(root, 'home'), { recursive: true })
  writeFileSync(join(root, 'home', 'cordis.patch.yml'), '- id: keep\n')
  const files = discoverPatchFiles({ profileDir, home: join(root, 'home') })
  assert.equal(files.length, 3)
  assert.match(files[0], /@scope\/bundle\/cordis.patch.yml/)
  assert.match(files[1], /profiles\/desktop\/cordis.patch.yml/)
  assert.match(files[2], /home\/cordis.patch.yml/)
})

test('without DSH_PROFILE_DIR it picks the profile that owns the package', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-astryx-home-'))
  const owned = join(home, 'profiles', 'desktop')
  const other = join(home, 'profiles', 'headless')
  mkdirSync(join(owned, 'node_modules', 'dsh-astryx'), { recursive: true })
  writeFileSync(join(owned, 'node_modules', 'dsh-astryx', 'package.json'), '{"name":"dsh-astryx"}')
  writeFileSync(join(owned, 'node_modules', 'dsh-astryx', 'cordis.patch.yml'), '- insert:\n    - id: dsh-astryx\n')
  mkdirSync(join(other, 'node_modules', 'other-bundle'), { recursive: true })
  writeFileSync(join(other, 'node_modules', 'other-bundle', 'cordis.patch.yml'), '- id: other\n')
  writeFileSync(join(home, 'cordis.patch.yml'), '- id: home-row\n')
  const files = discoverPatchFiles({ home })
  assert.equal(files.length, 2)
  assert.match(files[0], /profiles\/desktop\/node_modules\/dsh-astryx\/cordis.patch.yml/)
  assert.match(files[1], /\/cordis.patch.yml$/)
})

test('parses a CRLF patch file written on Windows', () => {
  const text = '- insert:\r\n    - id: dsh-astryx\r\n      name: dsh-astryx\r\n      config:\r\n        ttlHours: 6\r\n'
  const rows = parseRows(text, 'win')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'dsh-astryx')
  assert.equal(rows[0].name, 'dsh-astryx')
  assert.equal(rows[0].disabled, false)
})
