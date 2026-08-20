import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AVATARS, avatarById } from '../src/ai/registry.js'
import { avatarAmbientConfig } from '../src/ai/avatars/shared.js'

function recordingContext() {
  return {
    ops: 0, texts: [],
    fillStyle: '', strokeStyle: '', font: '', textBaseline: '', globalAlpha: 1, lineWidth: 1,
    clearRect() { this.ops++ }, fillRect(x, y) { this.ops++; this.texts.push({ x, y }) },
    fillText(ch, x, y) { this.ops++; this.texts.push({ ch, x, y }) },
    beginPath() {}, arc() {}, ellipse() {}, stroke() {}, clip() {},
    save() {}, restore() {}, setLineDash() {},
  }
}

const CFG = { density: .6, speed: .5, trail: .6, glyphs: 'katakana' }
const COLORS = { bg: '#000000', fg: '#00ff41', accent: '#00f0ff', dim: '#0a3d16', glow: '#00ff41' }

test('the three canvas avatars are registered', () => {
  for (const id of ['nexus', 'vortex', 'cipher-core']) {
    assert.equal(avatarById(id)?.kind, 'canvas', id)
  }
})

test('every canvas avatar exposes an effect with the engine contract', () => {
  for (const a of AVATARS.filter((x) => x.kind === 'canvas')) {
    const fx = a.effect()
    assert.equal(typeof fx.resize, 'function', a.id)
    assert.equal(typeof fx.step, 'function', a.id)
  }
})

test('a canvas avatar draws something after resize', () => {
  for (const a of AVATARS.filter((x) => x.kind === 'canvas')) {
    const fx = a.effect()
    const ctx = recordingContext()
    fx.resize(240, 180, CFG)
    fx.step(ctx, 240, 180, CFG, COLORS)
    assert.ok(ctx.ops > 0, `${a.id} drew nothing`)
  }
})

test('a canvas avatar survives step before resize', () => {
  for (const a of AVATARS.filter((x) => x.kind === 'canvas')) {
    const fx = a.effect()
    const ctx = recordingContext()
    assert.doesNotThrow(() => fx.step(ctx, 240, 180, CFG, COLORS), a.id)
  }
})

test('a canvas avatar survives a degenerate size', () => {
  for (const a of AVATARS.filter((x) => x.kind === 'canvas')) {
    const fx = a.effect()
    const ctx = recordingContext()
    assert.doesNotThrow(() => { fx.resize(0, 0, CFG); fx.step(ctx, 0, 0, CFG, COLORS) }, a.id)
  }
})

// Regression for the bug where unchecking "Fond animé" also froze whichever
// canvas avatar was mounted: nexus.js/vortex.js/cipher-core.js all used to
// hand createEngine() ctx.getAmbient directly, so engine.js's own per-frame
// `enabled` check (see ambient.test.js's "a live flip to disabled" case)
// applied to the avatar too. avatarAmbientConfig is the fix — an avatar is
// not the ambient background and must always report enabled, whatever the
// real ambient.enabled says, while still tracking every other ambient field.
test('an avatar ambient config always reports enabled, regardless of the real ambient toggle', () => {
  const ambient = { enabled: false, density: 0.4, speed: 0.7, trail: 0.6, glyphs: 'hex', resolutionScale: 1, fpsCap: 30 }
  const getConfig = avatarAmbientConfig({ getAmbient: () => ambient })
  assert.deepEqual(getConfig(), { ...ambient, enabled: true })
})

test('an avatar ambient config still reflects a real ambient.enabled: true', () => {
  const ambient = { enabled: true, density: 0.4 }
  const getConfig = avatarAmbientConfig({ getAmbient: () => ambient })
  assert.equal(getConfig().enabled, true)
  assert.equal(getConfig().density, 0.4)
})

test('drawing stays inside the canvas bounds', () => {
  const fx = avatarById('cipher-core').effect()
  const ctx = recordingContext()
  fx.resize(240, 180, CFG)
  for (let i = 0; i < 40; i++) fx.step(ctx, 240, 180, CFG, COLORS)
  for (const p of ctx.texts) {
    assert.ok(p.x >= -40 && p.x <= 280, `x out of range: ${p.x}`)
    assert.ok(p.y >= -240 && p.y <= 420, `y out of range: ${p.y}`)
  }
})
