import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaults } from '../src/core/schema.js'
import { createStore } from '../src/core/store.js'

// Minimal stand-in for the Web Storage API.
function fakeStorage(initial = {}, { failWrite = false } = {}) {
  const data = { ...initial }
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      if (failWrite) throw new DOMException('quota', 'QuotaExceededError')
      data[k] = String(v)
    },
    removeItem: (k) => { delete data[k] },
    _data: data,
  }
}

const ids = () => {
  let n = 0
  return () => `id-${++n}`
}

test('an empty storage yields the defaults', () => {
  const store = createStore({ storage: fakeStorage(), newId: ids() })
  assert.deepEqual(store.get(), defaults())
  assert.equal(store.persistent, true)
})

test('set writes through to storage', () => {
  const storage = fakeStorage()
  const store = createStore({ storage, newId: ids() })
  store.set('ambient.density', 0.9)
  assert.equal(store.get().ambient.density, 0.9)
  assert.equal(JSON.parse(storage._data['cyberdeck.config.v1']).ambient.density, 0.9)
})

test('set validates its value', () => {
  const store = createStore({ storage: fakeStorage(), newId: ids() })
  store.set('ambient.density', 42)
  assert.equal(store.get().ambient.density, 1)
})

// This is the exact write shortcuts.js's own patch() performs on a target
// field's `change` event: the whole array, one item's target replaced by
// whatever the field now holds — never through normalizeTarget, which only
// guards the editor's "add" button. The refusal has to hold here too, or an
// in-place edit is an open door normalizeTarget's own tests never cover.
test('editing a shortcut target to a refused scheme through the store drops it', () => {
  const store = createStore({ storage: fakeStorage(), newId: ids() })
  store.set('modules.shortcuts.items', [
    { id: 'a', label: 'Mine', target: 'https://safe.example', icon: '', accent: '' },
  ])
  assert.equal(store.get().modules.shortcuts.items.length, 1)

  store.set('modules.shortcuts.items', [
    { id: 'a', label: 'Mine', target: 'javascript:alert(1)', icon: '', accent: '' },
  ])
  assert.deepEqual(store.get().modules.shortcuts.items, [], 'the poisoned edit must not reach the store')
})

test('set on an unknown path leaves the config untouched', () => {
  const store = createStore({ storage: fakeStorage(), newId: ids() })
  store.set('nowhere.at.all', 1)
  assert.deepEqual(store.get(), defaults())
})

test('set cannot pollute the object prototype via __proto__', () => {
  const store = createStore({ storage: fakeStorage(), newId: ids() })
  store.set('theme.__proto__.toString', 'POLLUTED')
  assert.deepEqual(store.get(), defaults())
  assert.equal(({}).toString(), '[object Object]')
})

test('subscribers are notified with the new config', () => {
  const store = createStore({ storage: fakeStorage(), newId: ids() })
  const seen = []
  store.subscribe((c) => seen.push(c.ambient.speed))
  store.set('ambient.speed', 0.2)
  assert.deepEqual(seen, [0.2])
})

test('unsubscribing stops notifications', () => {
  const store = createStore({ storage: fakeStorage(), newId: ids() })
  let calls = 0
  const off = store.subscribe(() => { calls += 1 })
  store.set('ambient.speed', 0.2)
  off()
  store.set('ambient.speed', 0.3)
  assert.equal(calls, 1)
})

test('corrupt stored JSON falls back to defaults without throwing', () => {
  const storage = fakeStorage({ 'cyberdeck.config.v1': '{not json' })
  const store = createStore({ storage, newId: ids() })
  assert.deepEqual(store.get(), defaults())
})

test('a storage that refuses writes keeps working in memory', () => {
  const store = createStore({ storage: fakeStorage({}, { failWrite: true }), newId: ids() })
  store.set('ambient.speed', 0.4)
  assert.equal(store.get().ambient.speed, 0.4)
  assert.equal(store.persistent, false)
})

test('a missing storage API keeps working in memory', () => {
  const store = createStore({ storage: null, newId: ids() })
  store.set('ambient.speed', 0.4)
  assert.equal(store.get().ambient.speed, 0.4)
  assert.equal(store.persistent, false)
})

// columns used to be clamped to a wider range, so a value of 5 landed outside
// it and this test exercised the clamp surviving a round trip; now that the
// range has narrowed to 2-4, 5 clamps to 4 the moment a.set() runs, so both
// stores would agree on 4 even if fromJSON never re-validated at all. Setting
// both an under- and an over-range value keeps the round trip honest about
// actually exercising the clamp at both bounds, not just carrying an
// already-in-range number through unchanged.
test('toJSON then fromJSON round-trips, including values clamped at both bounds', () => {
  const a = createStore({ storage: fakeStorage(), newId: ids() })
  a.set('theme.name', 'arasaka')

  // ambient.fpsCap, not layout.columns: columns became a string enum when the
  // shortcuts grid started sizing itself, so it no longer clamps to anything
  // and cannot demonstrate a bound. fpsCap is the same kind of field the test
  // was written for — a bounded integer — and still is one.
  a.set('ambient.fpsCap', 0)
  assert.equal(a.get().ambient.fpsCap, 10, 'sanity: the store itself clamps to the lower bound')
  let b = createStore({ storage: fakeStorage(), newId: ids() })
  assert.equal(b.fromJSON(a.toJSON()).ok, true)
  assert.deepEqual(b.get(), a.get())

  a.set('ambient.fpsCap', 999)
  assert.equal(a.get().ambient.fpsCap, 60, 'sanity: the store itself clamps to the upper bound')
  b = createStore({ storage: fakeStorage(), newId: ids() })
  assert.equal(b.fromJSON(a.toJSON()).ok, true)
  assert.deepEqual(b.get(), a.get())
})

test('layout.columns takes only its enumerated values, and an old number is not one', () => {
  const store = createStore({ storage: fakeStorage(), newId: ids() })
  assert.equal(store.get().layout.columns, 'auto')
  store.set('layout.columns', '3')
  assert.equal(store.get().layout.columns, '3')
  // A config written before columns became an enum holds a number. It is not
  // in the enumeration, so it falls back to the default — which is 'auto',
  // and the grid fits itself, which is what someone who left it at the old
  // default of 2 was going to get anyway.
  store.set('layout.columns', 2)
  assert.equal(store.get().layout.columns, 'auto')
  store.set('layout.columns', 'seven')
  assert.equal(store.get().layout.columns, 'auto')
})

// A backup, a snippet copied from a forum, anything pasted into the panel's
// import textarea — store.fromJSON is the one path a whole configuration
// file takes into this app, and it shares validate()/validateShortcut with
// every other write. A refused scheme must not survive an import any more
// than it survives a direct edit.
test('importing a configuration whose shortcut carries a refused scheme drops just that shortcut', () => {
  const store = createStore({ storage: fakeStorage(), newId: ids() })
  const payload = JSON.stringify({
    modules: {
      shortcuts: {
        items: [
          { id: 'a', label: 'evil', target: 'javascript:alert(1)' },
          { id: 'b', label: 'fine', target: 'https://a.b' },
        ],
      },
    },
  })
  const result = store.fromJSON(payload)
  assert.equal(result.ok, true)
  const items = store.get().modules.shortcuts.items
  assert.equal(items.length, 1)
  assert.equal(items[0].label, 'fine')
})

test('fromJSON refuses invalid JSON and preserves the config', () => {
  const store = createStore({ storage: fakeStorage(), newId: ids() })
  store.set('theme.name', 'arasaka')
  const result = store.fromJSON('{ broken')
  assert.equal(result.ok, false)
  assert.ok(result.error.length > 0)
  assert.equal(store.get().theme.name, 'arasaka')
})

test('fromJSON refuses a JSON scalar', () => {
  const store = createStore({ storage: fakeStorage(), newId: ids() })
  assert.equal(store.fromJSON('"just a string"').ok, false)
  assert.equal(store.fromJSON('null').ok, false)
})

test('reset returns to defaults and notifies', () => {
  const store = createStore({ storage: fakeStorage(), newId: ids() })
  store.set('theme.name', 'arasaka')
  let notified = false
  store.subscribe(() => { notified = true })
  store.reset()
  assert.deepEqual(store.get(), defaults())
  assert.equal(notified, true)
})

test('get returns a frozen object', () => {
  const store = createStore({ storage: fakeStorage(), newId: ids() })
  assert.equal(Object.isFrozen(store.get()), true)
})

test('the three ink settings default to white and are independent', () => {
  const store = createStore({ storage: fakeStorage(), newId: ids() })
  const inks = () => {
    const l = store.get().layout
    return [l.ink, l.logoInk, l.avatarInk]
  }
  assert.deepEqual(inks(), ['white', 'white', 'white'])
  // Independence is the whole point: the wordmark and the portrait are the two
  // elements people want set apart, from the deck and from each other. Moving
  // any one of the three must leave the other two exactly where they were.
  store.set('layout.logoInk', 'theme')
  assert.deepEqual(inks(), ['white', 'theme', 'white'])
  store.set('layout.avatarInk', 'theme')
  assert.deepEqual(inks(), ['white', 'theme', 'theme'])
  store.set('layout.ink', 'theme')
  assert.deepEqual(inks(), ['theme', 'theme', 'theme'])
  store.set('layout.avatarInk', 'white')
  assert.deepEqual(inks(), ['theme', 'theme', 'white'])
  // Anything outside the enumeration falls back to the default rather than
  // reaching the stylesheet as an attribute nothing matches.
  store.set('layout.ink', 'chartreuse')
  assert.deepEqual(inks(), ['white', 'theme', 'white'])
})
