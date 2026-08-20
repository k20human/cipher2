import { test } from 'node:test'
import assert from 'node:assert/strict'
import cipher, { journalLines } from '../src/modules/cipher.js'
import { bootLines, stateLines, verdictLine } from '../src/core/journal.js'
import { defaults } from '../src/core/schema.js'
import { AVATAR_IDS } from '../src/ai/registry.js'

test('the module declares itself with a valid default avatar', () => {
  assert.equal(cipher.id, 'cipher')
  assert.equal(cipher.band, 'left')
  const decl = cipher.settings.find((d) => d.key === 'avatar')
  assert.ok(decl, 'no avatar declaration')
  assert.deepEqual(decl.options.map((o) => o.value), AVATAR_IDS)
  assert.ok(AVATAR_IDS.includes(decl.default))
})

test('every cipher setting matches a schema default', () => {
  const stored = defaults().modules.cipher
  for (const decl of cipher.settings) {
    assert.equal(stored[decl.key], decl.default, decl.key)
  }
})

test('boot lines are non-empty and prefixed', () => {
  const lines = bootLines()
  assert.ok(lines.length > 0)
  for (const l of lines) assert.match(l, /^> /)
})

test('state lines report a low battery', () => {
  const lines = stateLines({ battery: { percent: 8, charging: false }, link: 'online' })
  assert.ok(lines.some((l) => /BATTERY/i.test(l)), JSON.stringify(lines))
})

test('state lines report a lost link', () => {
  const lines = stateLines({ battery: null, link: 'offline' })
  assert.ok(lines.some((l) => /LINK/i.test(l)), JSON.stringify(lines))
})

test('state lines are quiet when everything is nominal', () => {
  const lines = stateLines({ battery: { percent: 87, charging: false }, link: 'online' })
  assert.ok(lines.every((l) => l.startsWith('> ')))
  assert.ok(lines.length <= 2, `too chatty: ${JSON.stringify(lines)}`)
})

test('state lines never throw on a malformed state', () => {
  for (const s of [null, undefined, {}, { battery: 'nope' }, { battery: { percent: NaN } }]) {
    assert.doesNotThrow(() => stateLines(s), JSON.stringify(s))
  }
})

test('state lines never throw when a property access itself throws', () => {
  // Optional chaining (state?.battery) only guards a missing `state`; it does
  // nothing against a present state whose own property is a getter that
  // raises when read. Task 9's real telemetry is exactly the kind of object
  // that could arrive in this shape (a sensor read that failed, surfaced as
  // a throwing accessor rather than a null).
  const throwingBattery = {}
  Object.defineProperty(throwingBattery, 'battery', {
    enumerable: true,
    get() { throw new Error('boom: battery getter') },
  })
  assert.doesNotThrow(() => stateLines(throwingBattery))
  assert.deepEqual(stateLines(throwingBattery), [])

  const throwingLink = { battery: null }
  Object.defineProperty(throwingLink, 'link', {
    enumerable: true,
    get() { throw new Error('boom: link getter') },
  })
  assert.doesNotThrow(() => stateLines(throwingLink))
  assert.deepEqual(stateLines(throwingLink), [])
})

test('journalLines is empty when the log setting is off', () => {
  const ctx = { settings: { log: false }, getDeckState: () => ({ link: 'online', battery: null }) }
  assert.deepEqual(journalLines(ctx), [])
})

test('journalLines is boot lines plus state lines when the log setting is on', () => {
  const ctx = { settings: { log: true }, getDeckState: () => ({ link: 'online', battery: null }) }
  const lines = journalLines(ctx)
  assert.ok(lines.length >= bootLines().length)
  assert.ok(lines.every((l) => l.startsWith('> ')))
})

test('journalLines never throws even when getDeckState itself throws', () => {
  // stateLines guards a hostile *state*; this is the call one level up —
  // ctx.getDeckState is main.js's own function today, a live telemetry
  // accessor tomorrow, and neither is this module's to trust.
  const ctx = { settings: { log: true }, getDeckState() { throw new Error('sensor offline') } }
  assert.doesNotThrow(() => journalLines(ctx))
  assert.deepEqual(journalLines(ctx), [])
})

test('journalLines never throws even when reading settings itself throws', () => {
  const ctx = { get settings() { throw new Error('store corrupt') } }
  assert.doesNotThrow(() => journalLines(ctx))
  assert.deepEqual(journalLines(ctx), [])
})

test('journalLines never throws when getDeckState is missing entirely', () => {
  const ctx = { settings: { log: true } }
  assert.doesNotThrow(() => journalLines(ctx))
})

const OK = {
  link: 'online',
  battery: { percent: 80, charging: false },
  cpu: { load: 0.2 },
  memory: { used_mb: 8000, total_mb: 31208 },
  storage: { free_gb: 500, total_gb: 1003.7 },
}

test('the verdict reports rather than reassures', () => {
  assert.equal(verdictLine(OK), 'All systems nominal, Operator.')
  assert.equal(verdictLine({ ...OK, link: 'offline' }), 'Link lost, running blind, Operator.')
  assert.equal(
    verdictLine({ ...OK, battery: { percent: 9, charging: false } }),
    'Battery critical at 9%, Operator.',
  )
  // Charging is not critical, however low.
  assert.equal(
    verdictLine({ ...OK, battery: { percent: 4, charging: true } }),
    'All systems nominal, Operator.',
  )
})

test('the verdict answers to every reading the column shows', () => {
  assert.match(verdictLine({ ...OK, storage: { free_gb: 40, total_gb: 1003.7 } }), /Storage almost full/)
  assert.match(verdictLine({ ...OK, memory: { used_mb: 29500, total_mb: 31208 } }), /Memory nearly exhausted/)
  assert.match(verdictLine({ ...OK, cpu: { load: 0.93 } }), /Running hot/)
  // A reading that is merely busy is not a fault worth the one sentence.
  assert.equal(verdictLine({ ...OK, cpu: { load: 0.6 } }), 'All systems nominal, Operator.')
  // A partial snapshot reports on what it has instead of inventing a fault.
  assert.equal(verdictLine({ link: 'online' }), 'All systems nominal, Operator.')
})

test('the verdict ranks worst first, since only one sentence is shown', () => {
  const everything = {
    link: 'offline',
    battery: { percent: 9, charging: false },
    cpu: { load: 0.99 },
    memory: { used_mb: 31000, total_mb: 31208 },
    storage: { free_gb: 1, total_gb: 1003.7 },
  }
  assert.equal(verdictLine(everything), 'Link lost, running blind, Operator.')
  const { link, ...noLink } = everything
  assert.match(verdictLine({ ...noLink, link: 'online' }), /Battery critical/)
})

test('every verdict addresses the Operator, whatever it reports', () => {
  const states = [
    OK,
    { ...OK, link: 'offline' },
    { ...OK, battery: { percent: 3, charging: false } },
    { ...OK, storage: { free_gb: 2, total_gb: 1003.7 } },
    { ...OK, memory: { used_mb: 31000, total_mb: 31208 } },
    { ...OK, cpu: { load: 0.99 } },
    undefined,
    null,
    { get link() { throw new Error('boom') } },
  ]
  // Indexed, not stringified: the last state's getter throws on read, and
  // JSON.stringify in a failure message would trip it before the assertion
  // it is meant to describe ever reported anything.
  states.forEach((state, i) => {
    assert.match(verdictLine(state), /, Operator\.$/, `state #${i}`)
  })
})

test('the verdict never claims nominal on a state it cannot read', () => {
  const hostile = { get link() { throw new Error('boom') } }
  assert.doesNotThrow(() => verdictLine(hostile))
  assert.equal(verdictLine(hostile), 'Status unreadable, Operator.')
  // Absent state is not unreadable state: nothing is known to be wrong.
  assert.equal(verdictLine(undefined), 'All systems nominal, Operator.')
})

test('the boot journal no longer claims what the verdict now reports', () => {
  assert.ok(!bootLines().some((l) => /NOMINAL/i.test(l)), bootLines().join(' | '))
})

test('the verdict and the journal agree on what critical means', () => {
  const at = (percent) => ({ link: 'online', battery: { percent, charging: false } })
  for (const percent of [1, 15, 16, 40]) {
    const journalSaysCritical = stateLines(at(percent)).some((l) => l.includes('CRITICAL'))
    const verdictSaysCritical = verdictLine(at(percent)).includes('critical')
    assert.equal(journalSaysCritical, verdictSaysCritical, `disagree at ${percent}%`)
  }
})
