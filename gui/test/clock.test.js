import { test } from 'node:test'
import assert from 'node:assert/strict'
import clock, { formatTime, formatDate } from '../src/modules/clock.js'

const at = (h, m, s) => new Date(2026, 7, 15, h, m, s)

test('time is always 24-hour and zero-padded', () => {
  assert.equal(formatTime(at(9, 5, 0), { seconds: false }), '09:05')
  assert.equal(formatTime(at(0, 30, 0), { seconds: false }), '00:30')
  assert.equal(formatTime(at(13, 5, 0), { seconds: false }), '13:05')
  assert.equal(formatTime(at(23, 59, 0), { seconds: false }), '23:59')
})

test('seconds appear only when asked', () => {
  assert.equal(formatTime(at(9, 5, 7), { seconds: true }), '09:05:07')
  assert.equal(formatTime(at(9, 5, 7), { seconds: false }), '09:05')
})

test('the date is rendered as a fixed-width stamp', () => {
  assert.equal(formatDate(at(9, 0, 0)), '15/08/2026')
  // A single-digit day and month both stay two characters wide, so the stamp
  // never changes length under the hour beside it.
  assert.equal(formatDate(new Date(2026, 0, 3, 9, 0, 0)), '03/01/2026')
})

test('the clock declares itself as a module', () => {
  assert.equal(clock.id, 'clock')
  assert.ok(clock.title.length > 0)
  assert.ok(Array.isArray(clock.settings))
  for (const decl of clock.settings) {
    assert.ok(decl.key && decl.type && decl.label, JSON.stringify(decl))
    assert.notEqual(decl.default, undefined, decl.key)
  }
})

test('every clock setting has a matching default in the schema', async () => {
  const { defaults } = await import('../src/core/schema.js')
  const stored = defaults().modules.clock
  for (const decl of clock.settings) {
    assert.equal(stored[decl.key], decl.default, decl.key)
  }
})

// clock.js resolves setInterval/clearInterval from the global scope at call
// time, so swapping the globals is enough to observe its timer bookkeeping
// without a fake clock library. `live` tracks every interval this stub
// currently considers running; a real leak would show up as `live` never
// shrinking back to the size the test expects.
function stubTimers() {
  const realSetInterval = globalThis.setInterval
  const realClearInterval = globalThis.clearInterval
  let nextId = 1
  const live = new Map()
  globalThis.setInterval = (fn, period) => {
    const id = nextId++
    live.set(id, { fn, period })
    return id
  }
  globalThis.clearInterval = (id) => {
    live.delete(id)
  }
  return {
    live,
    restore() {
      globalThis.setInterval = realSetInterval
      globalThis.clearInterval = realClearInterval
    },
  }
}

// clock.mount() sets el.innerHTML to a fixed two-node string, then looks up
// each node by class with querySelector. This double honours both ends of
// that contract — a class absent from the last-assigned HTML is not found,
// matching a real element — without pulling in an HTML parser.
function fakeClockHost() {
  let nodes = {}
  return {
    set innerHTML(html) {
      nodes = {}
      if (html.includes('class="clock__time"')) nodes['.clock__time'] = { textContent: '' }
      if (html.includes('class="clock__date"')) nodes['.clock__date'] = { textContent: '' }
    },
    get innerHTML() {
      return Object.keys(nodes).join('')
    },
    querySelector(selector) {
      return nodes[selector] ?? null
    },
  }
}

// Mimics main.js's makeContext closely enough for clock.js's own needs: a
// live `settings` getter (so a settings change is visible without a new
// mount) and onSettingsChange collecting listeners that `fire` invokes, the
// same way main.js's store.subscribe would.
function makeCtx(initialSettings) {
  let settings = { ...initialSettings }
  const listeners = []
  return {
    ctx: {
      get settings() { return settings },
      onSettingsChange(fn) { listeners.push(fn) },
    },
    fire(patch) {
      settings = { ...settings, ...patch }
      for (const fn of listeners) fn(settings)
    },
  }
}

test('mount, unmount, mount again leaves exactly one live interval, and none survive the final unmount', () => {
  const timers = stubTimers()
  try {
    const { ctx: ctx1 } = makeCtx({ seconds: false, format24: true })
    clock.mount(fakeClockHost(), ctx1)
    assert.equal(timers.live.size, 1, 'one interval after the first mount')

    clock.unmount()
    assert.equal(timers.live.size, 0, 'no interval survives the unmount')

    const { ctx: ctx2 } = makeCtx({ seconds: true, format24: true })
    clock.mount(fakeClockHost(), ctx2)
    assert.equal(timers.live.size, 1, 'one interval after remounting')
    const [id] = timers.live.keys()
    assert.equal(timers.live.get(id).period, 1000, 'the new mount honours its own settings')

    clock.unmount()
    assert.equal(timers.live.size, 0, 'no interval survives the final unmount')
  } finally {
    timers.restore()
  }
})

test('unmount leaves no live interval behind', () => {
  const timers = stubTimers()
  try {
    const { ctx } = makeCtx({ seconds: false, format24: true })
    clock.mount(fakeClockHost(), ctx)
    assert.equal(timers.live.size, 1)

    clock.unmount()
    assert.equal(timers.live.size, 0)
  } finally {
    timers.restore()
  }
})

test('a settings change clears the previous interval and swaps its period', () => {
  const timers = stubTimers()
  try {
    const { ctx, fire } = makeCtx({ seconds: false, format24: true })
    clock.mount(fakeClockHost(), ctx)
    assert.equal(timers.live.size, 1)
    const [firstId] = timers.live.keys()
    assert.equal(timers.live.get(firstId).period, 60000, 'no seconds: one tick per minute')

    fire({ seconds: true })
    assert.equal(timers.live.size, 1, 'exactly one interval survives the settings change')
    assert.ok(!timers.live.has(firstId), 'the previous interval was cleared, not left running alongside the new one')
    const [secondId] = timers.live.keys()
    assert.equal(timers.live.get(secondId).period, 1000, 'seconds on: one tick per second')

    fire({ seconds: false })
    assert.equal(timers.live.size, 1)
    const [thirdId] = timers.live.keys()
    assert.ok(!timers.live.has(secondId))
    assert.equal(timers.live.get(thirdId).period, 60000, 'seconds off again: back to one tick per minute')

    clock.unmount()
    assert.equal(timers.live.size, 0)
  } finally {
    timers.restore()
  }
})
