import { test } from 'node:test'
import assert from 'node:assert/strict'
import { THEMES, hexToHsl, hslToHex, resolveTheme, applyTheme } from '../src/core/theme.js'
import { THEME_NAMES } from '../src/core/schema.js'

test('every declared theme name has a palette', () => {
  for (const name of THEME_NAMES) {
    assert.ok(THEMES[name], `missing palette: ${name}`)
    for (const key of ['bg', 'fg', 'accent', 'dim', 'glow']) {
      assert.match(THEMES[name][key], /^#[0-9a-f]{6}$/i, `${name}.${key}`)
    }
  }
})

test('hex to hsl and back round-trips within rounding error', () => {
  for (const hex of ['#00ff41', '#fcee0a', '#ff003c', '#05060a', '#ffffff', '#000000']) {
    const { h, s, l } = hexToHsl(hex)
    const back = hslToHex(h, s, l)
    assert.equal(back.toLowerCase(), hex.toLowerCase(), hex)
  }
})

// deepEqual against THEMES.matrix no longer holds and should not: resolveTheme
// adds a derived `rain` entry that the stored palettes do not carry. Every
// stored key still has to come back untouched, which is what this asserts.
test('a null hue yields the stored palette untouched', () => {
  const out = resolveTheme('matrix', null)
  for (const [key, value] of Object.entries(THEMES.matrix)) {
    assert.equal(out[key], value, key)
  }
})

test('the rain gets its own shade: same family as fg, shifted and darker', () => {
  for (const name of THEME_NAMES) {
    const { fg, rain } = resolveTheme(name, null)
    assert.match(rain, /^#[0-9a-f]{6}$/i, name)
    assert.notEqual(rain, fg, `${name}: rain must not be the text colour`)
    const a = hexToHsl(fg)
    const b = hexToHsl(rain)
    assert.ok(Math.abs(((b.h - a.h) % 360 + 360) % 360 - 14) < 1, `${name}: hue shift`)
    assert.ok(b.l < a.l, `${name}: rain must be the darker of the two`)
  }
})

// The Teinte slider collapses every rotated key onto the one hue the user
// picked. The rain is derived after that rotation precisely so it does not
// collapse with them — without this it would come out at the text's own hue
// and the separation above would exist only at hue: null.
test('the rain keeps its offset from fg under a rotation', () => {
  const { fg, rain } = resolveTheme('matrix', 200)
  assert.equal(Math.round(hexToHsl(fg).h), 200)
  assert.equal(Math.round(hexToHsl(rain).h), 214)
})

test('resolveTheme returns an isolated copy, never the shared palette', () => {
  const out = resolveTheme('matrix', null)
  assert.notEqual(out, THEMES.matrix)
  out.fg = '#ffffff'
  assert.equal(THEMES.matrix.fg, '#00ff41')
  assert.throws(() => { THEMES.matrix.accent = '#ffffff' }, TypeError)
})

test('a hue rotates the foreground but never the background', () => {
  const out = resolveTheme('matrix', 200)
  assert.equal(out.bg, THEMES.matrix.bg)
  assert.equal(Math.round(hexToHsl(out.fg).h), 200)
  assert.equal(Math.round(hexToHsl(out.accent).h), 200)
  assert.equal(Math.round(hexToHsl(out.dim).h), 200)
})

test('a hue preserves saturation and lightness', () => {
  const before = hexToHsl(THEMES.matrix.dim)
  const after = hexToHsl(resolveTheme('matrix', 10).dim)
  assert.ok(Math.abs(before.s - after.s) < 0.01)
  assert.ok(Math.abs(before.l - after.l) < 0.01)
})

test('an unknown theme falls back to matrix', () => {
  const matrix = resolveTheme('matrix', null)
  assert.deepEqual(resolveTheme('vaporwave', null), matrix)
  assert.deepEqual(resolveTheme('toString', null), matrix)
  assert.deepEqual(resolveTheme('constructor', null), matrix)
})

test('applyTheme writes one CSS variable per palette entry', () => {
  const written = {}
  const root = { style: { setProperty: (k, v) => { written[k] = v } } }
  applyTheme(root, resolveTheme('arasaka', null))
  assert.equal(written['--bg'], THEMES.arasaka.bg)
  assert.equal(written['--fg'], THEMES.arasaka.fg)
  assert.equal(written['--accent'], THEMES.arasaka.accent)
  assert.equal(written['--dim'], THEMES.arasaka.dim)
  assert.equal(written['--glow'], THEMES.arasaka.glow)
  assert.equal(written['--rain'], resolveTheme('arasaka', null).rain)
})
