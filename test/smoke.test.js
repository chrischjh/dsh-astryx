import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, name } from '../index.js'

function fakeCtx() {
  const tools = []
  const sections = []
  return {
    tools,
    sections,
    get(service) {
      if (service === 'tools') return { register: (tool) => { tools.push(tool); return () => {} } }
      if (service === 'systemPrompt') return { section: (section) => { sections.push(section); return () => {} } }
      return undefined
    },
    effect(fn) { return fn() },
    logger: { warn() {} },
  }
}

test('activation registers both tools and one prompt section', () => {
  const ctx = fakeCtx()
  apply(ctx, { checkOnStart: false })
  assert.equal(name, 'astryx')
  assert.deepEqual(ctx.tools.map((tool) => tool.name), ['astryx_status', 'astryx_selfcheck'])
  assert.equal(ctx.sections.length, 1)
  assert.equal(ctx.sections[0].name, 'astryx:compat')
})

test('every tool declares a strict output contract', () => {
  const ctx = fakeCtx()
  apply(ctx, { checkOnStart: false })
  for (const tool of ctx.tools) {
    assert.equal(typeof tool.description, 'string')
    assert.equal(typeof tool.execute, 'function')
    assert.equal(typeof tool.output.render, 'function')
    assert.equal(tool.output.schema.additionalProperties, false)
    assertEveryRequiredKeyDeclared(tool.output.schema, tool.name)
  }
})

test('render functions work on a shape that satisfies their schema', () => {
  const ctx = fakeCtx()
  apply(ctx, { checkOnStart: false })
  const status = ctx.tools[0]
  const text = status.output.render({}, sampleFromSchema(status.output.schema))
  assert.equal(text[0].type, 'text')
  assert.match(text[0].text, /latest: core/)
})

test('config falls back to safe defaults', () => {
  const ctx = fakeCtx()
  apply(ctx, { ttlHours: -1, registry: 42, checkOnStart: 'yes' })
  assert.equal(ctx.tools.length, 2)
})

function assertEveryRequiredKeyDeclared(schema, label) {
  if (!schema || typeof schema !== 'object') return
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      assert.ok(schema.properties?.[key], `${label}: required key "${key}" is not declared`)
    }
  }
  for (const value of Object.values(schema.properties ?? {})) assertEveryRequiredKeyDeclared(value, label)
  if (schema.items) assertEveryRequiredKeyDeclared(schema.items, label)
}

function sampleFromSchema(schema) {
  const value = {}
  for (const [key, property] of Object.entries(schema.properties ?? {})) value[key] = sampleValue(property)
  return value
}

function sampleValue(schema) {
  if (schema.type === 'boolean') return false
  if (schema.type === 'number') return 0
  if (schema.type === 'array') return []
  if (schema.type === 'object') return sampleFromSchema(schema)
  return ''
}
