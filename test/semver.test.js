import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Semver } from '../src/semver.js'

test('parses release and prerelease versions', () => {
  assert.deepEqual(Semver.parse('0.7.17'), { major: 0, minor: 7, patch: 17, pre: '' })
  assert.equal(Semver.parse('0.7.18-canary.gfca8508').pre, 'canary.gfca8508')
  assert.equal(Semver.parse('not-a-version'), null)
})

test('orders releases, prereleases and build metadata', () => {
  assert.equal(Semver.compare('0.7.17', '0.7.18'), -1)
  assert.equal(Semver.compare('0.7.17', '0.7.17'), 0)
  assert.equal(Semver.compare('0.8.0-canary.1', '0.8.0'), -1)
  assert.equal(Semver.compare('0.8.0-canary.1', '0.8.0-canary.2'), -1)
  assert.equal(Semver.compare('1.0.0', '1.0.0+build'), 0)
})

test('satisfies comparator ranges', () => {
  assert.equal(Semver.satisfies('0.7.17', '>=0.7.0 <0.9.0'), true)
  assert.equal(Semver.satisfies('0.9.0', '>=0.7.0 <0.9.0'), false)
  assert.equal(Semver.satisfies('0.7.18-canary.1', '>=0.7.0 <0.9.0'), true)
  assert.equal(Semver.satisfies('0.7.17', '>=0.7.0 <=0.7.17'), true)
  assert.equal(Semver.satisfies('0.7.16', '>0.7.16'), false)
  assert.equal(Semver.satisfies('0.7.17', '0.7.17'), true)
  assert.equal(Semver.satisfies('0.7.17', '^0.7.0'), true)
  assert.equal(Semver.satisfies('1.0.0', '^0.7.0'), false)
  assert.equal(Semver.satisfies('bad', '>=0.7.0'), false)
  assert.equal(Semver.satisfies('0.7.17', ''), false)
})

test('isPrerelease and highest', () => {
  assert.equal(Semver.isPrerelease('0.8.0-canary.1'), true)
  assert.equal(Semver.isPrerelease('0.8.0'), false)
  assert.equal(Semver.highest(['0.7.1', '0.7.9', '0.8.0-canary.2']), '0.8.0-canary.2')
})
