import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseStatus, ageOf, isStale, formatLine } from '../src/core/telemetry.js'

const FULL = {
  ts: 1000, ip: '192.0.2.42',
  battery: { percent: 87, charging: false, temperature: 31.2 },
  wifi: { ssid: 'NET', rssi: -47, link_speed: 433 },
  cpu: { load: 0.34 }, memory: { used_mb: 2841, total_mb: 5734 },
  storage: { free_gb: 37.1, total_gb: 58 }, uptime_s: 184922,
}

test('a complete payload parses unchanged in shape', () => {
  const s = parseStatus(FULL)
  assert.equal(s.ip, '192.0.2.42')
  assert.equal(s.battery.percent, 87)
  assert.equal(s.ok, true)
})

test('null fields survive as null rather than throwing', () => {
  const s = parseStatus({ ts: 1, ip: null, battery: null, wifi: null, cpu: null, memory: null, storage: null, uptime_s: null })
  assert.equal(s.battery, null)
  assert.equal(s.ok, true)
})

test('garbage input yields a not-ok snapshot instead of throwing', () => {
  for (const junk of [null, undefined, 42, 'nope', [], { battery: 'yes' }]) {
    const s = parseStatus(junk)
    assert.equal(typeof s, 'object')
    assert.equal(s.ok, false, JSON.stringify(junk))
  }
})

test('out-of-range values are rejected field by field', () => {
  const s = parseStatus({ ...FULL, battery: { percent: 900, charging: false } })
  assert.equal(s.battery, null)
  assert.equal(s.ip, '192.0.2.42', 'a bad battery must not cost the ip')
})

test('age is measured in seconds from the payload timestamp', () => {
  assert.equal(ageOf({ ts: 1000 }, 1042000), 42)
  assert.equal(ageOf(null, 1042000), Infinity)
})

test('staleness follows the ttl', () => {
  assert.equal(isStale({ ts: 1000 }, 1010000, 30), false)
  assert.equal(isStale({ ts: 1000 }, 1040000, 30), true)
  assert.equal(isStale(null, 1000, 30), true)
})

test('lines are formatted for a fixed-width column', () => {
  assert.equal(formatLine('ip', '192.0.2.42'), '> IP      192.0.2.42')
  assert.equal(formatLine('battery', { percent: 87, charging: false }), '> BAT     87%')
  assert.equal(formatLine('battery', { percent: 87, charging: true }), '> BAT     87% ⚡')
  assert.equal(formatLine('wifi', { ssid: 'NET', rssi: -47 }), '> WIFI    NET  -47 dBm')
  // MiB on the wire, GB on screen — one decimal, as the storage line beside it.
  assert.equal(formatLine('memory', { used_mb: 25036, total_mb: 31208 }), '> MEM     24.4/30.5 GB (80%)')
  assert.equal(formatLine('memory', { used_mb: 0, total_mb: 1024 }), '> MEM     0.0/1.0 GB (0%)')
  // Storage reports what is used, like memory, so its share reads the same way
  // round: the wire still sends free space, and the line does the subtraction.
  assert.equal(formatLine('storage', { free_gb: 347.1, total_gb: 1003.7 }), '> DISK    656.6/1003.7 GB (65%)')
  assert.equal(formatLine('storage', { free_gb: 1003.7, total_gb: 1003.7 }), '> DISK    0.0/1003.7 GB (0%)')
})

test('a null value renders as unavailable rather than blank', () => {
  assert.match(formatLine('ip', null), /N\/A|—/)
})

// --- Additional coverage beyond the original fixture, following the same
// fault-injection spirit as the review of the API this parses. ---

test('wifi requires both the fields formatLine renders, or nulls as a whole', () => {
  assert.equal(parseStatus({ ...FULL, wifi: { ssid: 'NET' } }).wifi, null)
  assert.equal(parseStatus({ ...FULL, wifi: { rssi: -47 } }).wifi, null)
  assert.equal(parseStatus({ ...FULL, wifi: { ssid: 'NET', rssi: 'strong' } }).wifi, null)
})

test('an rssi outside a plausible dBm range is rejected', () => {
  assert.equal(parseStatus({ ...FULL, wifi: { ssid: 'NET', rssi: 12 } }).wifi, null)
})

test('memory where used exceeds total is nonsensical and rejected', () => {
  assert.equal(parseStatus({ ...FULL, memory: { used_mb: 9000, total_mb: 100 } }).memory, null)
})

test('storage where free exceeds total is nonsensical and rejected', () => {
  assert.equal(parseStatus({ ...FULL, storage: { free_gb: 900, total_gb: 10 } }).storage, null)
})

test('cpu load outside 0..1 is rejected', () => {
  assert.equal(parseStatus({ ...FULL, cpu: { load: 4.2 } }).cpu, null)
})

test('a negative uptime is rejected', () => {
  assert.equal(parseStatus({ ...FULL, uptime_s: -1 }).uptime_s, null)
})

test('a hostile getter that throws costs only its own field', () => {
  const raw = { ...FULL, get battery() { throw new Error('boom') } }
  const s = parseStatus(raw)
  assert.equal(s.battery, null)
  assert.equal(s.ip, '192.0.2.42')
})

test('formatLine never throws on an unexpected value shape', () => {
  for (const key of ['ip', 'battery', 'wifi', 'cpu', 'memory', 'storage', 'uptime', 'link']) {
    for (const junk of [undefined, 42, 'x', [], {}]) {
      assert.doesNotThrow(() => formatLine(key, junk), `${key}: ${JSON.stringify(junk)}`)
    }
  }
})

test('an unknown key still renders instead of throwing', () => {
  assert.doesNotThrow(() => formatLine('mystery', 'value'))
  assert.match(formatLine('mystery', 'value'), /MYSTERY/)
})

test('a share is omitted rather than invented when there is no total', () => {
  // A device reporting no memory at all gets no percentage: the alternative is
  // a division by zero rendered as '(NaN%)' on the deck's own status column.
  assert.equal(formatLine('memory', { used_mb: 0, total_mb: 0 }), '> MEM     0.0/0.0 GB')
  assert.equal(formatLine('storage', { free_gb: 0, total_gb: 0 }), '> DISK    0.0/0 GB')
  assert.doesNotThrow(() => formatLine('memory', { used_mb: 5, total_mb: -1 }))
})
