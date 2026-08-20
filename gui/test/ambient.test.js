import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canvasSize, frameInterval, createEngine } from '../src/ambient/engine.js'
import { GLYPHS, columnCount, createRain } from '../src/ambient/rain.js'
import { GLYPH_SETS } from '../src/core/schema.js'

test('canvas size scales css pixels, ignoring device pixel ratio', () => {
  assert.deepEqual(canvasSize(415, 900, 1), { width: 415, height: 900 })
  assert.deepEqual(canvasSize(415, 900, 0.5), { width: 208, height: 450 })
  assert.deepEqual(canvasSize(415, 900, 2), { width: 830, height: 1800 })
})

test('canvas size never collapses to zero', () => {
  const { width, height } = canvasSize(0, 0, 1)
  assert.ok(width >= 1 && height >= 1)
})

test('frame interval follows the cap', () => {
  assert.equal(frameInterval(30), 1000 / 30)
  assert.equal(frameInterval(60), 1000 / 60)
})

test('frame interval clamps a nonsense cap', () => {
  assert.equal(frameInterval(0), 1000 / 10)
  assert.equal(frameInterval(999), 1000 / 60)
})

test('every declared glyph set exists and is non-empty', () => {
  for (const name of GLYPH_SETS) {
    assert.ok(typeof GLYPHS[name] === 'string' && GLYPHS[name].length > 0, name)
  }
})

test('column count grows with width and with density', () => {
  assert.ok(columnCount(800, 1, 16) > columnCount(400, 1, 16))
  assert.ok(columnCount(400, 1, 16) > columnCount(400, 0.3, 16))
})

test('column count is at least one, whatever the input', () => {
  assert.ok(columnCount(1, 0.05, 16) >= 1)
  assert.ok(columnCount(0, 0, 16) >= 1)
})

test('full density fills the width with whole cells', () => {
  assert.equal(columnCount(400, 1, 16), 25)
})

test('the engine honours the frame cap', () => {
  const clock = { t: 0 }
  let pending = null
  const engine = createEngine({
    canvas: fakeCanvas(),
    effect: countingEffect(),
    getConfig: () => ({ enabled: true, fpsCap: 20, resolutionScale: 1, density: 0.5, speed: 0.5, trail: 0.5, glyphs: 'hex' }),
    getColors: () => ({ bg: '#000000', fg: '#00ff41' }),
    raf: (fn) => { pending = fn; return 1 },
    caf: () => { pending = null },
    now: () => clock.t,
    doc: fakeDoc(),
    win: { innerWidth: 400, innerHeight: 800 },
  })
  engine.start()
  // 20 animation callbacks 10 ms apart span 200 ms. At 20 fps that is exactly
  // 4 painted frames; without the cap it would be 20.
  for (let i = 0; i < 20; i += 1) {
    clock.t += 10
    pending?.()
  }
  assert.equal(engine.frameCount, 4, `painted ${engine.frameCount} frames`)
})

test('the engine stops when the page is hidden and resumes when shown', () => {
  const doc = fakeDoc()
  let pending = null
  const engine = createEngine({
    canvas: fakeCanvas(),
    effect: countingEffect(),
    getConfig: () => ({ enabled: true, fpsCap: 60, resolutionScale: 1, density: 0.5, speed: 0.5, trail: 0.5, glyphs: 'hex' }),
    getColors: () => ({ bg: '#000000', fg: '#00ff41' }),
    raf: (fn) => { pending = fn; return 1 },
    caf: () => { pending = null },
    now: () => 0,
    doc,
    win: { innerWidth: 400, innerHeight: 800 },
  })
  engine.start()
  assert.ok(pending !== null)
  doc.hidden = true
  doc.fire('visibilitychange')
  assert.equal(pending, null)
  doc.hidden = false
  doc.fire('visibilitychange')
  assert.ok(pending !== null)
})

test('a disabled ambient paints the background once and stops', () => {
  const effect = countingEffect()
  let pending = null
  const engine = createEngine({
    canvas: fakeCanvas(),
    effect,
    getConfig: () => ({ enabled: false, fpsCap: 30, resolutionScale: 1, density: 0.5, speed: 0.5, trail: 0.5, glyphs: 'hex' }),
    getColors: () => ({ bg: '#000000', fg: '#00ff41' }),
    raf: (fn) => { pending = fn; return 1 },
    caf: () => { pending = null },
    now: () => 0,
    doc: fakeDoc(),
    win: { innerWidth: 400, innerHeight: 800 },
  })
  engine.start()
  assert.equal(pending, null)
  assert.equal(effect.steps, 0)
})

test('a live flip to disabled stops the loop on its very next frame, with no setConfig call', () => {
  const clock = { t: 0 }
  let pending = null
  const cfg = { enabled: true, fpsCap: 20, resolutionScale: 1, density: 0.5, speed: 0.5, trail: 0.5, glyphs: 'hex' }
  const effect = countingEffect()
  const engine = createEngine({
    canvas: fakeCanvas(),
    effect,
    getConfig: () => cfg,
    getColors: () => ({ bg: '#000000', fg: '#00ff41' }),
    raf: (fn) => { pending = fn; return 1 },
    caf: () => { pending = null },
    now: () => clock.t,
    doc: fakeDoc(),
    win: { innerWidth: 400, innerHeight: 800 },
  })
  engine.start()

  // Drive a few frames while enabled, well past the 50 ms cap (fpsCap 20),
  // so the effect actually paints and this test isn't vacuously true.
  for (let i = 0; i < 3; i += 1) {
    clock.t += 60
    pending?.()
  }
  const stepsWhileEnabled = effect.steps
  assert.ok(stepsWhileEnabled > 0)

  // Flip the config the running engine reads, mid-flight. Nobody calls
  // setConfig() — the loop must notice on its own next tick.
  cfg.enabled = false
  clock.t += 60
  const cb = pending
  pending = null // isolate: only a fresh raf() call would set this again
  cb?.()

  assert.equal(pending, null, 'tick must not reschedule once disabled')
  assert.equal(effect.steps, stepsWhileEnabled, 'the effect must not step once disabled')
})

test('rain advances its columns and stays inside the canvas', () => {
  const rain = createRain()
  const cfg = { density: 1, speed: 1, trail: 0.5, glyphs: 'hex' }
  rain.resize(400, 800, cfg)
  const ctx = recordingContext()
  for (let i = 0; i < 50; i += 1) rain.step(ctx, 400, 800, cfg, { bg: '#000000', fg: '#00ff41' })
  assert.ok(ctx.texts.length > 0)
  for (const { x, y } of ctx.texts) {
    assert.ok(x >= 0 && x <= 400, `x out of bounds: ${x}`)
    assert.ok(y >= -800 && y <= 1600, `y wildly out of bounds: ${y}`)
  }
})

// --- doubles -------------------------------------------------------------

function recordingContext() {
  return {
    texts: [],
    canvas: { width: 400, height: 800 },
    fillStyle: '',
    font: '',
    textBaseline: '',
    globalAlpha: 1,
    fillRect() {},
    fillText(ch, x, y) { this.texts.push({ ch, x, y }) },
  }
}

function fakeCanvas() {
  return {
    width: 0,
    height: 0,
    style: {},
    getContext: () => recordingContext(),
  }
}

function fakeDoc() {
  const handlers = {}
  return {
    hidden: false,
    addEventListener(name, fn) { (handlers[name] ??= []).push(fn) },
    removeEventListener(name, fn) {
      handlers[name] = (handlers[name] ?? []).filter((h) => h !== fn)
    },
    fire(name) { for (const fn of handlers[name] ?? []) fn() },
  }
}

function countingEffect() {
  return {
    steps: 0,
    resize() {},
    step() { this.steps += 1 },
  }
}
