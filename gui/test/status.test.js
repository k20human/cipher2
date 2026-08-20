import { test } from 'node:test'
import assert from 'node:assert/strict'
import status, { isRealFailure } from '../src/modules/status.js'
import { defaults } from '../src/core/schema.js'

// mount() is deliberately never called here: it starts a timer and a fetch
// against a relative URL that has no meaning under Node, matching the
// project's own line for this module — rendering and polling are verified
// manually in a browser, not by this suite (see the README's "Tests" section).

test('the module declares itself under the status id with no fixed band', () => {
  assert.equal(status.id, 'status')
  // No band field: containerFor defaults a bandless module to the right —
  // the same way shortcuts.js already relies on that default.
  assert.equal(status.band, undefined)
})

test('every status setting matches a schema default', () => {
  const stored = defaults().modules.status
  for (const decl of status.settings) {
    assert.equal(stored[decl.key], decl.default, decl.key)
  }
})

test('every schema field for modules.status has a matching panel declaration', () => {
  const stored = defaults().modules.status
  const declared = new Set(status.settings.map((d) => d.key))
  for (const key of Object.keys(stored)) {
    assert.ok(declared.has(key), `${key} has no panel declaration`)
  }
})

// The one judgment call the fix round centered on: teardown()'s own
// controller.abort() must never be counted as evidence the deck is
// unreachable. A real fetch abort rejects with exactly this DOMException
// shape (name: 'AbortError'), which is what makes this reachable without
// mounting a fetch/AbortController/DOM lifecycle.
test('an aborted request is not a real failure', () => {
  assert.equal(isRealFailure(new DOMException('The operation was aborted.', 'AbortError')), false)
  assert.equal(isRealFailure({ name: 'AbortError' }), false)
})

test('any other rejection is still a real failure', () => {
  assert.equal(isRealFailure(new TypeError('Failed to fetch')), true)
  assert.equal(isRealFailure(new Error('500')), true)
  assert.equal(isRealFailure(undefined), true)
  assert.equal(isRealFailure(null), true)
})
