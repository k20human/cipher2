import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectClasses, applyEffects } from '../src/core/effects.js'
import { defaults, AMBIENT_SCOPES } from '../src/core/schema.js'

function fakeBody(initial) {
  const values = new Set(initial)
  return {
    _values: values,
    classList: {
      add: (...n) => n.forEach((x) => values.add(x)),
      remove: (...n) => n.forEach((x) => values.delete(x)),
      [Symbol.iterator]: () => values[Symbol.iterator](),
    },
  }
}

test('only enabled effects yield a class', () => {
  const c = effectClasses({ scanlines: true, grain: false, vignette: true, glitch: false, glow: false })
  assert.deepEqual(c.sort(), ['fx-scanlines', 'fx-vignette'])
})

test('every schema effect maps to a class', () => {
  const all = Object.fromEntries(Object.keys(defaults().effects).map((k) => [k, true]))
  assert.equal(effectClasses(all).length, Object.keys(all).length)
})

test('applyEffects replaces effect classes and spares the others', () => {
  const body = fakeBody(['theme-boot', 'fx-grain'])
  applyEffects(body, { scanlines: true, grain: false, vignette: false, glitch: false, glow: false })
  assert.deepEqual([...body._values].sort(), ['fx-scanlines', 'theme-boot'])
})

test('the ambient scope is a declared enumeration with a safe default', () => {
  assert.deepEqual(AMBIENT_SCOPES, ['column', 'fullscreen'])
  assert.ok(AMBIENT_SCOPES.includes(defaults().ambient.scope))
})
