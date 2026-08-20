import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG_VERSION, MODULE_IDS, defaults, validate, truncateGraphemes, ACCENT_FORMAT } from '../src/core/schema.js'

const ids = () => {
  let n = 0
  return () => `id-${++n}`
}

test('defaults survive validation unchanged', () => {
  const d = defaults()
  assert.deepEqual(validate(d, { newId: ids() }), d)
})

test('defaults are a fresh object every call', () => {
  const a = defaults()
  a.ambient.density = 0.1
  assert.equal(defaults().ambient.density, 0.6)
})

test('garbage input yields full defaults', () => {
  for (const junk of [null, undefined, 42, 'nope', [], true]) {
    assert.deepEqual(validate(junk, { newId: ids() }), defaults())
  }
})

test('out-of-range numbers are clamped, not rejected', () => {
  const c = validate({ ambient: { density: 9, resolutionScale: 0.01 } }, { newId: ids() })
  assert.equal(c.ambient.density, 1)
  assert.equal(c.ambient.resolutionScale, 0.5)
})

test('wrong types fall back to their default', () => {
  const c = validate({ ambient: { density: 'loud', enabled: 'yes' } }, { newId: ids() })
  assert.equal(c.ambient.density, 0.6)
  assert.equal(c.ambient.enabled, true)
})

test('unknown theme falls back to matrix', () => {
  assert.equal(validate({ theme: { name: 'vaporwave' } }, { newId: ids() }).theme.name, 'matrix')
})

test('hue accepts null or 0..359 and rejects the rest', () => {
  const opts = { newId: ids() }
  assert.equal(validate({ theme: { hue: null } }, opts).theme.hue, null)
  assert.equal(validate({ theme: { hue: 200 } }, opts).theme.hue, 200)
  assert.equal(validate({ theme: { hue: 900 } }, opts).theme.hue, null)
  assert.equal(validate({ theme: { hue: 'blue' } }, opts).theme.hue, null)
})

test('a corrupt field does not destroy its siblings', () => {
  const c = validate({ ambient: { density: 'bad', speed: 0.9 } }, { newId: ids() })
  assert.equal(c.ambient.density, 0.6)
  assert.equal(c.ambient.speed, 0.9)
})

test('a hostile getter that throws costs only its own section', () => {
  const raw = {
    get theme() { throw new Error('boom') },
    ambient: { density: 0.3 },
  }
  const c = validate(raw, { newId: ids() })
  assert.deepEqual(c.theme, defaults().theme)
  assert.equal(c.ambient.density, 0.3)
})

test('unknown fields are dropped', () => {
  const c = validate({ ambient: { density: 0.3, unicorn: true }, ghost: 1 }, { newId: ids() })
  assert.equal(c.ambient.unicorn, undefined)
  assert.equal(c.ghost, undefined)
})

test('layout.order keeps only known module ids, in order', () => {
  const c = validate({ layout: { order: ['shortcuts', 'weather', 'clock'] } }, { newId: ids() })
  assert.deepEqual(c.layout.order, ['shortcuts', 'clock'])
})

test('layout.order may be empty', () => {
  assert.deepEqual(validate({ layout: { order: [] } }, { newId: ids() }).layout.order, [])
})

test('a shortcut without a target is dropped', () => {
  const c = validate(
    { modules: { shortcuts: { items: [{ label: 'nowhere' }, { label: 'ok', target: 'https://a.b' }] } } },
    { newId: ids() },
  )
  assert.equal(c.modules.shortcuts.items.length, 1)
  assert.equal(c.modules.shortcuts.items[0].label, 'ok')
})

// normalizeTarget (src/modules/shortcuts.js) refuses these schemes too, but
// only guards the editor's "add" button, whose target is a hardcoded literal
// today. validateShortcut is the checkpoint every write to the store shares
// — a direct edit and a JSON import both bypass normalizeTarget entirely and
// land here, so the refusal has to hold at this boundary regardless of it.
test('a shortcut carrying a refused scheme is dropped, just like a missing target', () => {
  const c = validate(
    {
      modules: {
        shortcuts: {
          items: [
            { label: 'evil', target: 'javascript:alert(1)' },
            { label: 'ok', target: 'https://a.b' },
          ],
        },
      },
    },
    { newId: ids() },
  )
  assert.equal(c.modules.shortcuts.items.length, 1)
  assert.equal(c.modules.shortcuts.items[0].label, 'ok')
})

test('every refused scheme is rejected at the schema boundary, not only in the editor', () => {
  const refused = [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ]
  for (const target of refused) {
    const c = validate({ modules: { shortcuts: { items: [{ target }] } } }, { newId: ids() })
    assert.equal(c.modules.shortcuts.items.length, 0, target)
  }
})

test('a plausible CSS colour accent survives validation', () => {
  for (const accent of ['#0f0', '#00ff41', '#00ff41ff', 'cyan', 'rebeccapurple', 'rgb(0, 255, 65)', 'hsla(120, 100%, 50%, .5)']) {
    const c = validate({ modules: { shortcuts: { items: [{ target: 'https://a.b', accent }] } } }, { newId: ids() })
    assert.equal(c.modules.shortcuts.items[0].accent, accent, accent)
  }
})

test('an empty accent is left alone, not treated as unparseable', () => {
  const c = validate({ modules: { shortcuts: { items: [{ target: 'https://a.b', accent: '' }] } } }, { newId: ids() })
  assert.equal(c.modules.shortcuts.items[0].accent, '')
})

// The same threat validateShortcut's target check exists for: accent is
// arbitrary text handed straight into a CSS custom property. An accent that
// does not look like plausible colour syntax must not reach the store.
test('an accent that is not plausible CSS colour syntax is dropped to empty, not passed through', () => {
  for (const accent of ['url(https://evil.example/x)', 'javascript:alert(1)', 'red; background: url(x)', '1e3', '#gg0000']) {
    const c = validate(
      { modules: { shortcuts: { items: [{ target: 'https://a.b', accent }] } } },
      { newId: ids() },
    )
    assert.equal(c.modules.shortcuts.items[0].accent, '', accent)
  }
})

test('ACCENT_FORMAT accepts the shapes validateShortcut is meant to allow', () => {
  for (const accent of ['#0f0', '#00ff41', 'cyan', 'rgba(0,0,0,.5)']) {
    assert.ok(ACCENT_FORMAT.test(accent), accent)
  }
  assert.equal(ACCENT_FORMAT.test(''), false, 'empty is handled separately by validateShortcut, not by the regex')
})

test('a shortcut missing an id receives one', () => {
  const c = validate(
    { modules: { shortcuts: { items: [{ target: 'https://a.b' }] } } },
    { newId: ids() },
  )
  assert.equal(c.modules.shortcuts.items[0].id, 'id-1')
})

test('a shortcut missing an id gets one from the real default newId', () => {
  const c = validate({ modules: { shortcuts: { items: [{ target: 'https://a.b' }] } } })
  assert.equal(typeof c.modules.shortcuts.items[0].id, 'string')
  assert.ok(c.modules.shortcuts.items[0].id.length > 0)
})

test('a throwing newId costs only that shortcut, not the rest of the config', () => {
  const throwingId = () => { throw new Error('no ids left') }
  const c = validate(
    {
      theme: { name: 'arasaka' },
      modules: {
        shortcuts: {
          items: [
            { target: 'https://a.b' },
            { id: 'kept', target: 'https://c.d' },
          ],
        },
      },
    },
    { newId: throwingId },
  )
  assert.equal(c.theme.name, 'arasaka')
  assert.equal(c.modules.shortcuts.items.length, 1)
  assert.equal(c.modules.shortcuts.items[0].id, 'kept')
})

test('a shortcut keeps the id it already has', () => {
  const c = validate(
    { modules: { shortcuts: { items: [{ id: 'kept', target: 'https://a.b' }] } } },
    { newId: ids() },
  )
  assert.equal(c.modules.shortcuts.items[0].id, 'kept')
})

test('shortcut text fields are length-capped', () => {
  const c = validate(
    { modules: { shortcuts: { items: [{ target: 'https://a.b', label: 'x'.repeat(200), icon: 'abcdef' }] } } },
    { newId: ids() },
  )
  assert.equal(c.modules.shortcuts.items[0].label.length, 32)
  assert.equal(c.modules.shortcuts.items[0].icon.length, 3)
})

test('version is always the current one', () => {
  assert.equal(validate({ version: 99 }, { newId: ids() }).version, CONFIG_VERSION)
})

test('grapheme truncation keeps a flag emoji whole or drops it entirely', () => {
  // A regional-indicator pair is 4 UTF-16 units; slice(0,3) would leave a
  // lone surrogate that renders as tofu.
  assert.equal(truncateGraphemes('🇫🇷', 3), '🇫🇷')
  assert.equal(truncateGraphemes('🇫🇷🇩🇪🇮🇹🇪🇸', 3), '🇫🇷🇩🇪🇮🇹')
  assert.equal(truncateGraphemes('abcdef', 3), 'abc')
  assert.equal(truncateGraphemes('', 3), '')
})

test('grapheme truncation never emits an unpaired surrogate', () => {
  for (const input of ['🇫🇷', '👨‍👩‍👧', '👍🏽', 'é́x']) {
    const out = truncateGraphemes(input, 1)
    for (const unit of out) {
      const code = unit.charCodeAt(0)
      assert.ok(!(code >= 0xd800 && code <= 0xdbff) || out.length > 1, `lone high surrogate in ${JSON.stringify(out)}`)
    }
    assert.equal(out, [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(input)].slice(0, 1).map((s) => s.segment).join(''))
  }
})

test('a shortcut icon is truncated by grapheme, not by code unit', () => {
  const c = validate(
    { modules: { shortcuts: { items: [{ target: 'https://a.b', icon: '🇫🇷🇩🇪🇮🇹🇪🇸' }] } } },
    { newId: () => 'x' },
  )
  assert.equal(c.modules.shortcuts.items[0].icon, '🇫🇷🇩🇪🇮🇹')
})

test('a fresh install ships four shortcuts', () => {
  const items = defaults().modules.shortcuts.items
  assert.equal(items.length, 4)
  for (const it of items) {
    assert.ok(it.id && it.label && it.target, JSON.stringify(it))
  }
  assert.deepEqual(items.map((i) => i.label), ['YT Music', 'Météo', 'Actu', 'Termux'])
})

test('the default shortcuts survive validation unchanged', () => {
  const d = defaults()
  assert.deepEqual(validate(d, { newId: () => 'x' }).modules.shortcuts.items, d.modules.shortcuts.items)
})

test('default shortcut ids are fixed literals, not generated: two calls agree', () => {
  const a = defaults().modules.shortcuts.items.map((i) => i.id)
  const b = defaults().modules.shortcuts.items.map((i) => i.id)
  assert.deepEqual(a, b)
  assert.deepEqual(a, ['yt-music', 'meteo', 'actu', 'termux'])
})

test('format24 is gone from the schema', () => {
  assert.equal(defaults().modules.clock.format24, undefined)
})

test('status sits between cipher and shortcuts in the default order', () => {
  const order = defaults().layout.order
  assert.ok(order.indexOf('cipher') < order.indexOf('status'))
  assert.ok(order.indexOf('status') < order.indexOf('shortcuts'))
  assert.ok(MODULE_IDS.includes('status'))
})

test('rightView defaults to status and only accepts a known module id', () => {
  assert.equal(defaults().layout.rightView, 'status')
  assert.equal(validate({ layout: { rightView: 'shortcuts' } }, { newId: ids() }).layout.rightView, 'shortcuts')
  assert.equal(validate({ layout: { rightView: 'weather' } }, { newId: ids() }).layout.rightView, 'status')
})

test('ambient.scope defaults to column and accepts fullscreen', () => {
  const opts = { newId: ids() }
  assert.equal(defaults().ambient.scope, 'column')
  assert.equal(validate({ ambient: { scope: 'fullscreen' } }, opts).ambient.scope, 'fullscreen')
  assert.equal(validate({ ambient: { scope: 'bogus' } }, opts).ambient.scope, 'column')
})

test('modules.status booleans fall back independently and intervalMs is clamped', () => {
  const c = validate(
    { modules: { status: { ip: false, battery: 'nope', intervalMs: 1 } } },
    { newId: ids() },
  )
  assert.equal(c.modules.status.ip, false)
  assert.equal(c.modules.status.battery, true)
  assert.equal(c.modules.status.intervalMs, 2000)
  assert.equal(validate({ modules: { status: { intervalMs: 999999 } } }, { newId: ids() }).modules.status.intervalMs, 60000)
})
