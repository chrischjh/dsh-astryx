import { test } from 'node:test'
import assert from 'node:assert/strict'

function fakeReact() {
  return {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
  }
}

let cached
async function loadClient() {
  if (cached !== undefined) return cached
  globalThis.window = { __ModuleLoader__: { load: (value) => { cached = value } } }
  await import('../client.js')
  delete globalThis.window
  return cached
}

test('the client half registers under the package id and needs slots + locale', async () => {
  const registration = await loadClient()
  assert.equal(registration.id, 'dsh-astryx')
  const result = registration.factory((name) => (name === 'react' ? fakeReact() : undefined))
  assert.deepEqual(result.inject, ['slots', 'locale'])
  assert.equal(typeof result.apply, 'function')
})

test('apply registers the detail-page section and the dictionary', async () => {
  const registration = await loadClient()
  const result = registration.factory((name) => (name === 'react' ? fakeReact() : undefined))
  const registered = []
  const locales = []
  const ctx = {
    effect: (fn) => fn(),
    locale: {
      register: (ns, dict) => { locales.push({ ns, dict }); return () => {} },
      bind: (ns) => (key) => key,
      subscribe: () => () => {},
      getSnapshot: () => ({ active: 'zh' }),
    },
    slots: {
      inject: (name, factory) => factory(),
      register: (spec, component) => { registered.push({ spec, component }); return { name: spec.name } },
    },
  }
  result.apply(ctx)
  assert.equal(locales.length, 1)
  assert.match(locales[0].dict.zh['setup.title'], /开发就绪/)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].spec.name, 'plugins.detail.section')
  assert.equal(registered[0].spec.id, 'dsh-astryx-panel')
  assert.equal(typeof registered[0].spec.label, 'function')
})

test('the section renders nothing for other bundles', async () => {
  const registration = await loadClient()
  const result = registration.factory((name) => (name === 'react' ? fakeReact() : undefined))
  let component
  const ctx = {
    effect: (fn) => fn(),
    locale: { register: () => () => {}, bind: () => (key) => key, subscribe: () => () => {}, getSnapshot: () => ({ active: 'zh' }) },
    slots: { inject: (name, factory) => factory(), register: (spec, value) => { component = value; return { name: spec.name } } },
  }
  result.apply(ctx)
  assert.equal(component({ subject: { kind: 'bundle', pkg: { name: 'other-plugin' } } }), null)
  assert.notEqual(component({ subject: { kind: 'bundle', pkg: { name: 'dsh-astryx' } } }), null)
})
