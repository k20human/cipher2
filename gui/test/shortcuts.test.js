import { test } from 'node:test'
import assert from 'node:assert/strict'
import shortcuts, { normalizeTarget, moveItem, createShortcut, bestFit } from '../src/modules/shortcuts.js'

test('a bare domain becomes https', () => {
  assert.equal(normalizeTarget('youtube.com'), 'https://youtube.com')
  assert.equal(normalizeTarget('  news.ycombinator.com/news '), 'https://news.ycombinator.com/news')
})

test('an explicit scheme is left alone', () => {
  assert.equal(normalizeTarget('https://a.b/c?d=1'), 'https://a.b/c?d=1')
  assert.equal(normalizeTarget('http://192.0.2.10:8080'), 'http://192.0.2.10:8080')
  assert.equal(normalizeTarget('spotify:track:xyz'), 'spotify:track:xyz')
  assert.equal(
    normalizeTarget('intent://scan/#Intent;scheme=zxing;package=com.google.zxing;end'),
    'intent://scan/#Intent;scheme=zxing;package=com.google.zxing;end',
  )
})

test('an empty or blank target is rejected', () => {
  for (const raw of ['', '   ', null, undefined, 42]) {
    assert.equal(normalizeTarget(raw), null, String(raw))
  }
})

test('javascript: and data: targets are refused', () => {
  assert.equal(normalizeTarget('javascript:alert(1)'), null)
  assert.equal(normalizeTarget('JavaScript:alert(1)'), null)
  assert.equal(normalizeTarget('data:text/html,<script>'), null)
})

test('moveItem swaps neighbours and returns a new array', () => {
  const items = ['a', 'b', 'c']
  assert.deepEqual(moveItem(items, 0, 1), ['b', 'a', 'c'])
  assert.deepEqual(moveItem(items, 2, -1), ['a', 'c', 'b'])
  assert.deepEqual(items, ['a', 'b', 'c'])
})

test('moveItem is a no-op at the edges', () => {
  assert.deepEqual(moveItem(['a', 'b'], 0, -1), ['a', 'b'])
  assert.deepEqual(moveItem(['a', 'b'], 1, 1), ['a', 'b'])
  assert.deepEqual(moveItem(['a', 'b'], 7, 1), ['a', 'b'])
})

test('createShortcut normalizes, caps and assigns an id', () => {
  let n = 0
  const s = createShortcut(
    { label: 'x'.repeat(99), target: 'example.com', icon: 'abcdef', accent: '' },
    () => `id-${++n}`,
  )
  assert.equal(s.id, 'id-1')
  assert.equal(s.target, 'https://example.com')
  assert.equal(s.label.length, 32)
  assert.equal([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s.icon)].length, 3)
})

test('createShortcut truncates the icon by grapheme', () => {
  const s = createShortcut({ label: 'x', target: 'a.b', icon: '🇫🇷🇩🇪🇮🇹🇪🇸' }, () => 'id')
  assert.equal(s.icon, '🇫🇷🇩🇪🇮🇹')
})

test('createShortcut refuses an unusable target', () => {
  assert.equal(createShortcut({ target: '  ' }, () => 'x'), null)
  assert.equal(createShortcut({ target: 'javascript:1' }, () => 'x'), null)
})

// Matches schema.js's own validateShortcut, the boundary every write to the
// store shares: a non-string icon is dropped to '', never stringified. Before
// this, createShortcut's String(fields.icon ?? '') would have turned a
// number or object into text schema.js would never have accepted from any
// other path (a direct edit or a JSON import).
test('createShortcut drops a non-string icon rather than stringifying it', () => {
  for (const icon of [42, {}, [], true]) {
    const s = createShortcut({ label: 'Spotify', target: 'a.b', icon }, () => 'x')
    assert.equal(s.icon, 'S', `icon ${JSON.stringify(icon)} must fall back like an empty one, not stringify`)
  }
})

test('createShortcut falls back to the first label letter when no icon is given', () => {
  const s = createShortcut({ label: 'Spotify', target: 'spotify:', icon: '' }, () => 'x')
  assert.equal(s.icon, 'S')
})

test('the shortcuts module declares itself and carries a custom editor', () => {
  assert.equal(shortcuts.id, 'shortcuts')
  assert.ok(Array.isArray(shortcuts.settings))
  assert.equal(typeof shortcuts.settingsView, 'function')
})

// shortcuts.js resolves setTimeout/clearTimeout from the global scope at call
// time, so swapping the globals is enough to observe and drive its long-press
// timer without a fake clock library — the same trick clock.test.js uses for
// setInterval/clearInterval.
function stubTimeout() {
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  let nextId = 1
  const live = new Map()
  globalThis.setTimeout = (fn, delay) => {
    const id = nextId++
    live.set(id, { fn, delay })
    return id
  }
  globalThis.clearTimeout = (id) => {
    live.delete(id)
  }
  return {
    live,
    // Fires every timer currently due at `ms`, the way a real clock would
    // once that much time had passed.
    advance(ms) {
      for (const [id, { fn, delay }] of [...live]) {
        if (delay <= ms) {
          live.delete(id)
          fn()
        }
      }
    },
    restore() {
      globalThis.setTimeout = realSetTimeout
      globalThis.clearTimeout = realClearTimeout
    },
  }
}

// shortcuts.js reaches `document` as a bare global, which plain Node never
// declares. Standing one up on globalThis is enough for the bare identifier
// to resolve, the same mechanism clock.test.js relies on for its timers.
function stubDocument() {
  const real = globalThis.document
  globalThis.document = { createElement: () => fakeElement() }
  return {
    restore() {
      globalThis.document = real
    },
  }
}

// Honours exactly the DOM surface renderGrid()/attachLongPress() touch:
// className, dataset, href, style.setProperty, an innerHTML that spawns the
// icon/label spans the same way fakeClockHost() spawns clock's two nodes,
// appendChild/replaceChildren, and an addEventListener that records its
// listeners so a test can fire one directly.
function fakeElement() {
  let spans = {}
  let children = []
  const listeners = {}
  return {
    className: '',
    dataset: {},
    href: '',
    textContent: '',
    style: { setProperty() {} },
    set innerHTML(html) {
      spans = {}
      if (html.includes('class="tile__icon"')) spans['.tile__icon'] = fakeElement()
      if (html.includes('class="tile__label"')) spans['.tile__label'] = fakeElement()
    },
    get innerHTML() {
      return Object.keys(spans).join('')
    },
    querySelector(selector) {
      return spans[selector] ?? null
    },
    appendChild(node) {
      children.push(node)
      return node
    },
    replaceChildren() {
      children = []
    },
    addEventListener(type, fn) {
      (listeners[type] ??= []).push(fn)
    },
    get listeners() { return listeners },
    get children() { return children },
  }
}

// Mimics main.js's makeContext closely enough for shortcuts.js's own needs:
// a fixed item list and an observable openEditor.
function makeShortcutsCtx(items, openEditor) {
  return {
    get settings() { return { items } },
    onSettingsChange() {},
    openEditor,
  }
}

test('a long press outlived by unmount does not throw and does not open the editor', () => {
  const doc = stubDocument()
  const timers = stubTimeout()
  try {
    const host = fakeElement()
    let openedId = null
    const ctx = makeShortcutsCtx(
      [{ id: 'a', label: 'A', target: 'https://a.example', icon: 'A', accent: '' }],
      (id) => { openedId = id },
    )

    shortcuts.mount(host, ctx)
    const tile = host.children[0].children[0]
    const [pointerdown] = tile.listeners.pointerdown
    pointerdown()
    assert.equal(timers.live.size, 1, 'the long-press timer is scheduled')

    // The module is torn down — e.g. the enable toggle drops it from
    // layout.order — before the 500 ms elapse.
    shortcuts.unmount()

    assert.doesNotThrow(() => timers.advance(500))
    assert.equal(openedId, null, 'the editor is not opened once the module is gone')
  } finally {
    timers.restore()
    doc.restore()
  }
})

// Chrome Android fires pointermove for sub-pixel jitter under a resting
// finger; before LONG_PRESS_SLOP existed, attachLongPress cancelled on any
// movement at all, so a long press could fail to survive to LONG_PRESS_MS on
// a real touchscreen even while the finger never left the tile.
test('a long press survives sub-threshold pointer jitter', () => {
  const doc = stubDocument()
  const timers = stubTimeout()
  try {
    const host = fakeElement()
    let openedId = null
    const ctx = makeShortcutsCtx(
      [{ id: 'a', label: 'A', target: 'https://a.example', icon: 'A', accent: '' }],
      (id) => { openedId = id },
    )

    shortcuts.mount(host, ctx)
    const tile = host.children[0].children[0]
    const [pointerdown] = tile.listeners.pointerdown
    const [pointermove] = tile.listeners.pointermove
    pointerdown({ clientX: 100, clientY: 100 })
    assert.equal(timers.live.size, 1)

    pointermove({ clientX: 103, clientY: 101 }) // ~3.2px: jitter, not a drag
    assert.equal(timers.live.size, 1, 'small jitter must not cancel the long press')

    timers.advance(500)
    assert.equal(openedId, 'a', 'the long press still fires after mere jitter')
  } finally {
    timers.restore()
    doc.restore()
  }
})

test('a real drag past the slop radius still cancels the long press', () => {
  const doc = stubDocument()
  const timers = stubTimeout()
  try {
    const host = fakeElement()
    let openedId = null
    const ctx = makeShortcutsCtx(
      [{ id: 'a', label: 'A', target: 'https://a.example', icon: 'A', accent: '' }],
      (id) => { openedId = id },
    )

    shortcuts.mount(host, ctx)
    const tile = host.children[0].children[0]
    const [pointerdown] = tile.listeners.pointerdown
    const [pointermove] = tile.listeners.pointermove
    pointerdown({ clientX: 100, clientY: 100 })

    pointermove({ clientX: 100, clientY: 130 }) // 30px: a real move
    assert.equal(timers.live.size, 0, 'a real move past the slop radius cancels the pending long press')

    assert.doesNotThrow(() => timers.advance(500))
    assert.equal(openedId, null, 'a scroll/drag must not open the editor')
  } finally {
    timers.restore()
    doc.restore()
  }
})

test('a long press does not throw when the pointer events carry no coordinates', () => {
  // The existing "outlived by unmount" test above already calls pointerdown()
  // with no event object; this covers pointermove the same way, since a
  // defensive `event?.clientX` must not throw when event is undefined.
  const doc = stubDocument()
  const timers = stubTimeout()
  try {
    const host = fakeElement()
    const ctx = makeShortcutsCtx(
      [{ id: 'a', label: 'A', target: 'https://a.example', icon: 'A', accent: '' }],
      () => {},
    )
    shortcuts.mount(host, ctx)
    const tile = host.children[0].children[0]
    const [pointerdown] = tile.listeners.pointerdown
    const [pointermove] = tile.listeners.pointermove
    pointerdown()
    assert.doesNotThrow(() => pointermove())
  } finally {
    timers.restore()
    doc.restore()
  }
})

// Honours the DOM surface settingsView() touches: className/type/textContent,
// dataset, a plain `value`, an innerHTML that spawns one child per
// class="…" it contains (generalized via regex rather than hardcoded, since
// the editor's rows carry six named children instead of the tile's two),
// querySelector/appendChild/replaceChildren, and a listener-recording
// addEventListener — the same shape as fakeElement() above, adapted to the
// editor's markup so a test can drive its handlers directly.
function makeEditorNode() {
  const listeners = {}
  const children = {}
  let appended = []
  return {
    className: '',
    type: '',
    textContent: '',
    dataset: {},
    value: '',
    set innerHTML(markup) {
      for (const m of markup.matchAll(/class="([\w-]+)"/g)) children[m[1]] = makeEditorNode()
    },
    get innerHTML() { return Object.keys(children).join('') },
    querySelector(selector) { return children[selector.replace(/^\./, '')] ?? null },
    appendChild(node) { appended.push(node); return node },
    replaceChildren() { appended = [] },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn) },
    get listeners() { return listeners },
    get children() { return appended },
  }
}

function stubEditorDocument() {
  const real = globalThis.document
  globalThis.document = { createElement: () => makeEditorNode() }
  return { restore() { globalThis.document = real } }
}

// Mimics only the two store methods settingsView calls, on the single path
// it ever writes: modules.shortcuts.items.
function fakeShortcutsStore(items) {
  let config = { modules: { shortcuts: { items } } }
  return {
    get: () => config,
    set(path, value) {
      if (path === 'modules.shortcuts.items') config = { modules: { shortcuts: { items: value } } }
    },
  }
}

test('two field edits on different rows in the same render both survive', () => {
  const doc = stubEditorDocument()
  try {
    const store = fakeShortcutsStore([
      { id: 'a', label: 'Alpha', target: 'https://a.example', icon: 'A', accent: '' },
      { id: 'b', label: 'Beta', target: 'https://b.example', icon: 'B', accent: '' },
    ])
    const host = makeEditorNode()
    shortcuts.settingsView(host, { store, moveItem, createShortcut, rerender: () => {} })
    const [rowA, rowB] = host.children[0].children

    rowA.querySelector('.editor__label').value = 'Alpha!'
    rowA.querySelector('.editor__label').listeners.change[0]()
    rowB.querySelector('.editor__label').value = 'Beta!'
    rowB.querySelector('.editor__label').listeners.change[0]()

    assert.deepEqual(
      store.get().modules.shortcuts.items.map((i) => i.label),
      ['Alpha!', 'Beta!'],
      'neither edit should undo the other',
    )
  } finally {
    doc.restore()
  }
})

test('an edit survives an unrelated structural action (add)', () => {
  const doc = stubEditorDocument()
  try {
    const store = fakeShortcutsStore([
      { id: 'a', label: 'Alpha', target: 'https://a.example', icon: 'A', accent: '' },
      { id: 'b', label: 'Beta', target: 'https://b.example', icon: 'B', accent: '' },
    ])
    const host = makeEditorNode()
    let rerenders = 0
    shortcuts.settingsView(host, { store, moveItem, createShortcut, rerender: () => { rerenders += 1 } })
    const [rowA] = host.children[0].children
    const add = host.children[1]

    rowA.querySelector('.editor__label').value = 'Alpha!'
    rowA.querySelector('.editor__label').listeners.change[0]()
    add.listeners.click[0]()

    const items = store.get().modules.shortcuts.items
    assert.equal(items.length, 3, 'the new shortcut was appended')
    assert.equal(items.find((i) => i.id === 'a').label, 'Alpha!', "row A's edit must survive the add")
    assert.equal(rerenders, 1)
  } finally {
    doc.restore()
  }
})

test('a field edit on a reordered row lands on that row, not on whatever now sits at its old index', () => {
  const doc = stubEditorDocument()
  try {
    const store = fakeShortcutsStore([
      { id: 'a', label: 'Alpha', target: 'https://a.example', icon: 'A', accent: '' },
      { id: 'b', label: 'Beta', target: 'https://b.example', icon: 'B', accent: '' },
    ])
    const host = makeEditorNode()
    shortcuts.settingsView(host, { store, moveItem, createShortcut, rerender: () => {} })
    const [, rowB] = host.children[0].children // bound to id 'b', originally at index 1

    rowB.querySelector('.editor__up').listeners.click[0]()
    assert.deepEqual(
      store.get().modules.shortcuts.items.map((i) => i.id), ['b', 'a'],
      'the reorder itself applies',
    )

    // rowB is still the same row the user is looking at; edit it after the
    // reorder moved it to index 0. An index-keyed fix would instead write to
    // index 1 — row A's new slot — corrupting it.
    rowB.querySelector('.editor__label').value = 'Beta!'
    rowB.querySelector('.editor__label').listeners.change[0]()

    const items = store.get().modules.shortcuts.items
    assert.deepEqual(items.map((i) => i.id), ['b', 'a'], 'the reorder must not be undone by the edit')
    assert.equal(items.find((i) => i.id === 'b').label, 'Beta!', "row B's own edit lands on row B")
    assert.equal(items.find((i) => i.id === 'a').label, 'Alpha', 'row A must be untouched')
  } finally {
    doc.restore()
  }
})

// schema.js's validateShortcut drops a shortcut whose target is empty or
// carries a refused scheme, rather than keeping the row with a bad target —
// correct at that boundary, but patch() used to write straight through to
// the store with no guard of its own, so a plain select-all-delete on a
// target field deleted the shortcut entirely.
test('emptying a shortcut target through the editor does not delete the row', () => {
  const doc = stubEditorDocument()
  try {
    const store = fakeShortcutsStore([
      { id: 'a', label: 'Alpha', target: 'https://a.example', icon: 'A', accent: '' },
    ])
    const host = makeEditorNode()
    shortcuts.settingsView(host, { store, moveItem, createShortcut, rerender: () => {} })
    const [rowA] = host.children[0].children
    const targetInput = rowA.querySelector('.editor__target')

    targetInput.value = '   '
    targetInput.listeners.change[0]()

    const items = store.get().modules.shortcuts.items
    assert.equal(items.length, 1, 'the shortcut must survive an emptied target')
    assert.equal(items[0].target, 'https://a.example', 'the stored target is untouched')
    assert.equal(targetInput.value, 'https://a.example', 'the field is put back to the stored value')
  } finally {
    doc.restore()
  }
})

test('setting a shortcut target to a refused scheme through the editor does not delete the row', () => {
  const doc = stubEditorDocument()
  try {
    const store = fakeShortcutsStore([
      { id: 'a', label: 'Alpha', target: 'https://a.example', icon: 'A', accent: '' },
    ])
    const host = makeEditorNode()
    shortcuts.settingsView(host, { store, moveItem, createShortcut, rerender: () => {} })
    const [rowA] = host.children[0].children
    const targetInput = rowA.querySelector('.editor__target')

    targetInput.value = 'javascript:alert(1)'
    targetInput.listeners.change[0]()

    const items = store.get().modules.shortcuts.items
    assert.equal(items.length, 1)
    assert.equal(items[0].target, 'https://a.example')
    assert.equal(targetInput.value, 'https://a.example')
  } finally {
    doc.restore()
  }
})

test('a valid target edit through the editor still commits normally', () => {
  const doc = stubEditorDocument()
  try {
    const store = fakeShortcutsStore([
      { id: 'a', label: 'Alpha', target: 'https://a.example', icon: 'A', accent: '' },
    ])
    const host = makeEditorNode()
    shortcuts.settingsView(host, { store, moveItem, createShortcut, rerender: () => {} })
    const [rowA] = host.children[0].children
    const targetInput = rowA.querySelector('.editor__target')

    targetInput.value = 'https://new.example'
    targetInput.listeners.change[0]()

    assert.equal(store.get().modules.shortcuts.items[0].target, 'https://new.example')
  } finally {
    doc.restore()
  }
})

// The band at the 900x412 reference device: ~268px wide inside its padding,
// ~250px tall once the prompt has taken its share.
const BAND = { width: 268, height: 250, gap: 12, min: 56 }

test('the grid fits its box instead of growing past it', () => {
  for (const count of [1, 2, 3, 4, 5, 6, 9, 12]) {
    const fit = bestFit({ ...BAND, count })
    const rows = Math.ceil(count / fit.columns)
    const usedWidth = fit.columns * fit.size + (fit.columns - 1) * BAND.gap
    const usedHeight = rows * fit.size + (rows - 1) * BAND.gap
    assert.ok(fit.fits, `${count} tiles should fit`)
    assert.ok(usedWidth <= BAND.width + 0.01, `${count} tiles overflow the width`)
    assert.ok(usedHeight <= BAND.height + 0.01, `${count} tiles overflow the height`)
    assert.ok(fit.size >= BAND.min, `${count} tiles fall under the touch target`)
    assert.ok(fit.columns <= count, `${count} tiles asked for empty columns`)
  }
})

test('the grid picks the arrangement that makes the tiles largest', () => {
  // Four tiles in a near-square box: 2x2 beats both 1x4 and 4x1, and beats
  // 3+1 too, which wastes a whole row on one tile.
  assert.equal(bestFit({ ...BAND, count: 4 }).columns, 2)
  // A wide, short box has no room for rows, so the same four go across.
  assert.equal(bestFit({ width: 600, height: 80, gap: 12, min: 56, count: 4 }).columns, 4)
})

test('the grid scrolls only when fitting would break the touch target', () => {
  const many = bestFit({ ...BAND, count: 40 })
  assert.equal(many.fits, false)
  assert.ok(many.size >= BAND.min, 'tiles are never shrunk past the touch target')
  assert.ok(many.columns >= 1)
})

test('a layout that does not overflow is never reported as overflowing', () => {
  // A narrow band with four columns forced on it: bestFit drops to as many as
  // it can draw legibly, and the result still fits down the page. Reporting
  // fits: false here would put a scrollbar on a grid that needs none, and
  // shove it to the top of the band instead of centring it.
  const fit = bestFit({ width: 254, height: 211, gap: 12, min: 56, count: 4, columns: 4 })
  assert.ok(fit.columns < 4, 'the band cannot draw four legibly')
  assert.equal(fit.fits, true)
  const rows = Math.ceil(4 / fit.columns)
  assert.ok(rows * fit.size + (rows - 1) * 12 <= 211.01)
})

test('a fixed column count is honoured, and still sized to the box', () => {
  const fit = bestFit({ ...BAND, count: 4, columns: 4 })
  assert.equal(fit.columns, 4)
  assert.ok(fit.size * 4 + 3 * BAND.gap <= BAND.width + 0.01)
  // More columns than tiles would be empty tracks, so the count is capped.
  assert.equal(bestFit({ ...BAND, count: 2, columns: 4 }).columns, 2)
})

test('an unmeasured box yields no answer rather than a wrong one', () => {
  assert.equal(bestFit({ ...BAND, width: 0, count: 4 }), null)
  assert.equal(bestFit({ ...BAND, height: 0, count: 4 }), null)
  assert.equal(bestFit({ ...BAND, count: 0 }), null)
})
