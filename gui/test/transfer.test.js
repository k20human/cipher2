import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildExportFilename, renderSystemSection } from '../src/settings/transfer.js'

test('the export filename carries a sortable date', () => {
  assert.equal(buildExportFilename(new Date(2026, 7, 15)), 'cyberdeck-config-2026-08-15.json')
})

test('the export filename pads single digits', () => {
  assert.equal(buildExportFilename(new Date(2026, 0, 3)), 'cyberdeck-config-2026-01-03.json')
})

// renderSystemSection takes `doc` as an explicit option, so a fake document
// only needs createElement — no global `document` stubbing required, unlike
// shortcuts.js's settingsView. Honours the same DOM surface as
// makeEditorNode() in shortcuts.test.js: className, textContent, dataset, a
// plain `value`, an innerHTML that spawns one child per class="..." it
// contains, querySelector, and a listener-recording addEventListener.
function makeNode() {
  const listeners = {}
  const children = {}
  return {
    className: '',
    textContent: '',
    dataset: {},
    value: '',
    // Captures both the class name and its flat inner text (every
    // class-tagged element in this markup is flat: no nested tags), so a
    // spawned child starts out carrying whatever text its real counterpart
    // would — needed to check the warning's actual wording, not just that
    // a node with the right class exists.
    set innerHTML(markup) {
      for (const m of markup.matchAll(/class="([\w-]+)"[^>]*>([^<]*)/g)) {
        const node = makeNode()
        node.textContent = m[2]
        children[m[1]] = node
      }
    },
    get innerHTML() { return Object.keys(children).join('') },
    querySelector(selector) { return children[selector.replace(/^\./, '')] ?? null },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn) },
    get listeners() { return listeners },
  }
}

const fakeDoc = { createElement: () => makeNode() }

// Mimics only what renderSystemSection reads from the store: persistence
// (a plain property, so tests can flip it between calls), a fixed export
// payload, a scriptable fromJSON result, and a countable reset.
function fakeStore({ persistent = true, fromJSONResult = { ok: true } } = {}) {
  let resets = 0
  return {
    persistent,
    toJSON: () => '{}',
    fromJSON: () => fromJSONResult,
    reset() { resets += 1 },
    get resets() { return resets },
  }
}

test('a successful import rerenders and puts the confirmation on the fresh section', () => {
  const store = fakeStore({ fromJSONResult: { ok: true } })
  const fresh = makeNode()
  fresh.innerHTML = '<p class="system__status"></p>'
  let rerenders = 0
  const section = renderSystemSection({
    store, doc: fakeDoc, rerender: () => { rerenders += 1; return fresh },
  })

  section.querySelector('.system__import').listeners.click[0]()

  assert.equal(rerenders, 1, 'a successful import must trigger the rerender callback')
  assert.equal(fresh.querySelector('.system__status').textContent, 'Configuration importée.')
  assert.equal(fresh.querySelector('.system__status').dataset.ok, 'true')
  assert.equal(section.querySelector('.system__status').textContent, '',
    'the message must not land on the old, discarded section')
})

test('a refused import does not rerender and reports the refusal on the same section', () => {
  const store = fakeStore({ fromJSONResult: { ok: false, error: 'broken JSON' } })
  let rerenders = 0
  const section = renderSystemSection({
    store, doc: fakeDoc, rerender: () => { rerenders += 1; return section },
  })

  section.querySelector('.system__import').listeners.click[0]()

  assert.equal(rerenders, 0, 'a refused import must not trigger the rerender callback')
  assert.match(section.querySelector('.system__status').textContent, /Import refusé/)
  assert.equal(section.querySelector('.system__status').dataset.ok, 'false')
})

test('declining the reset confirmation neither resets nor rerenders', () => {
  const store = fakeStore()
  let rerenders = 0
  const realConfirm = globalThis.confirm
  globalThis.confirm = () => false
  try {
    const section = renderSystemSection({
      store, doc: fakeDoc, rerender: () => { rerenders += 1; return section },
    })
    section.querySelector('.system__reset').listeners.click[0]()
    assert.equal(store.resets, 0)
    assert.equal(rerenders, 0)
    assert.equal(section.querySelector('.system__status').textContent, '', 'nothing to report on cancel')
  } finally {
    globalThis.confirm = realConfirm
  }
})

test('confirming the reset resets then rerenders, reporting success on the fresh section', () => {
  const store = fakeStore()
  const fresh = makeNode()
  fresh.innerHTML = '<p class="system__status"></p>'
  let rerenders = 0
  const realConfirm = globalThis.confirm
  globalThis.confirm = () => true
  try {
    const section = renderSystemSection({
      store, doc: fakeDoc, rerender: () => { rerenders += 1; return fresh },
    })
    section.querySelector('.system__reset').listeners.click[0]()
    assert.equal(store.resets, 1)
    assert.equal(rerenders, 1)
    assert.equal(fresh.querySelector('.system__status').textContent, 'Réglages réinitialisés.')
  } finally {
    globalThis.confirm = realConfirm
  }
})

test('omitting rerender falls back to updating this same section in place', () => {
  const store = fakeStore({ fromJSONResult: { ok: true } })
  const section = renderSystemSection({ store, doc: fakeDoc })

  section.querySelector('.system__import').listeners.click[0]()

  assert.equal(section.querySelector('.system__status').textContent, 'Configuration importée.')
})

test('a non-persistent store renders a standing warning at construction', () => {
  const store = fakeStore({ persistent: false })
  const section = renderSystemSection({ store, doc: fakeDoc })

  const warning = section.querySelector('.system__warning')
  assert.ok(warning, 'the warning node must exist')
  assert.match(warning.textContent, /Stockage local indisponible/)
})

test('a persistent store renders no warning node at all', () => {
  const store = fakeStore({ persistent: true })
  const section = renderSystemSection({ store, doc: fakeDoc })

  assert.equal(section.querySelector('.system__warning'), null)
})

test('a successful import leaves the storage warning in place and reports success separately', () => {
  const store = fakeStore({ persistent: false, fromJSONResult: { ok: true } })
  // Mimics what a real rerender produces while store.persistent is still
  // false: a fresh section carrying both nodes, built independently of
  // whatever say()/sayAfterRerender do.
  const fresh = makeNode()
  fresh.innerHTML = '<p class="system__warning">Stockage local indisponible : les réglages seront perdus à la fermeture.</p>'
    + '<p class="system__status"></p>'
  const section = renderSystemSection({ store, doc: fakeDoc, rerender: () => fresh })

  section.querySelector('.system__import').listeners.click[0]()

  assert.ok(fresh.querySelector('.system__warning'), 'the warning must survive a successful import')
  assert.match(fresh.querySelector('.system__warning').textContent, /Stockage local indisponible/)
  assert.equal(fresh.querySelector('.system__status').textContent, 'Configuration importée.',
    'the confirmation is reported on the status node, separately from the warning')
})

test('a store whose persistence fails between renders shows the warning on the next render', () => {
  const store = fakeStore({ persistent: true })

  const first = renderSystemSection({ store, doc: fakeDoc })
  assert.equal(first.querySelector('.system__warning'), null, 'no warning while persistent')

  // The write failed during whatever just ran (e.g. an import): store.js
  // flips persistent to false, and the next render (this call) must pick
  // that up fresh.
  store.persistent = false
  const second = renderSystemSection({ store, doc: fakeDoc })
  assert.ok(second.querySelector('.system__warning'), 'the next render must show the warning')
})
