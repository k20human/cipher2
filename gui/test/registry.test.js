import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveOrder, createRegistry, mountModules, containerFor, nextInCycle } from '../src/core/registry.js'
import cipherModule from '../src/modules/cipher.js'
import clockModule from '../src/modules/clock.js'
import shortcutsModule from '../src/modules/shortcuts.js'

const defs = [
  { id: 'clock', title: 'Clock', settings: [], mount() {}, unmount() {} },
  { id: 'shortcuts', title: 'Shortcuts', settings: [], mount() {}, unmount() {} },
]

test('resolveOrder keeps the requested order', () => {
  assert.deepEqual(resolveOrder(['shortcuts', 'clock'], ['clock', 'shortcuts']), ['shortcuts', 'clock'])
})

test('resolveOrder drops ids with no module behind them', () => {
  assert.deepEqual(resolveOrder(['clock', 'weather'], ['clock', 'shortcuts']), ['clock'])
})

test('resolveOrder drops duplicates', () => {
  assert.deepEqual(resolveOrder(['clock', 'clock'], ['clock']), ['clock'])
})

test('resolveOrder does not silently mount what the order omits', () => {
  assert.deepEqual(resolveOrder(['clock'], ['clock', 'shortcuts']), ['clock'])
})

test('the registry indexes definitions by id', () => {
  const registry = createRegistry(defs)
  assert.equal(registry.byId('clock').title, 'Clock')
  assert.equal(registry.byId('nope'), undefined)
  assert.deepEqual(registry.ids(), ['clock', 'shortcuts'])
})

test('mountModules mounts in order and appends one host per module', () => {
  const registry = createRegistry(defs.map((d) => ({ ...d, mount(el) { el.mounted = d.id } })))
  const container = fakeElement()
  mountModules(registry, ['shortcuts', 'clock'], container, () => ({}))
  assert.deepEqual(container.children.map((c) => c.mounted), ['shortcuts', 'clock'])
  assert.deepEqual(container.children.map((c) => c.dataset.module), ['shortcuts', 'clock'])
})

test('the teardown returned by mountModules unmounts and empties the container', () => {
  const unmounted = []
  const registry = createRegistry(
    defs.map((d) => ({ ...d, unmount() { unmounted.push(d.id) } })),
  )
  const container = fakeElement()
  const teardown = mountModules(registry, ['clock', 'shortcuts'], container, () => ({}))
  teardown()
  assert.deepEqual(unmounted, ['clock', 'shortcuts'])
  assert.deepEqual(container.children, [])
})

test('a module that throws on mount does not stop its neighbours', () => {
  const registry = createRegistry([
    { id: 'clock', title: 'Clock', settings: [], mount() { throw new Error('boom') }, unmount() {} },
    { id: 'shortcuts', title: 'Shortcuts', settings: [], mount(el) { el.mounted = 'shortcuts' }, unmount() {} },
  ])
  const container = fakeElement()
  mountModules(registry, ['clock', 'shortcuts'], container, () => ({}))
  assert.equal(container.children.at(-1).mounted, 'shortcuts')
  // A module that throws is skipped, not merely logged: no dead host may
  // linger in the DOM for the rest of the session.
  assert.equal(container.children.length, 1)
  assert.ok(!container.children.some((c) => c.dataset.module === 'clock'))
})

test("every real module's declared band resolves to a container that exists", () => {
  // The actual module definitions, not fixtures: this is what would break if
  // a future module declared a band containerFor doesn't recognise (a typo,
  // or a value from before a band container was retired), or if main.js's
  // own `containers` map (built from real DOM nodes) ever dropped one of the
  // three keys this test stands in for.
  const containers = { left: 'LEFT', right: 'RIGHT', foot: 'FOOT' }
  assert.equal(containerFor(cipherModule, containers), 'LEFT')
  assert.equal(containerFor(clockModule, containers), 'FOOT')
  assert.equal(containerFor(shortcutsModule, containers), 'RIGHT')
  for (const def of [cipherModule, clockModule, shortcutsModule]) {
    assert.ok(containerFor(def, containers), `${def.id} resolved to no container`)
  }
})

test('containerFor defaults an unknown, missing, or absent band to right rather than throwing', () => {
  const containers = { left: 'LEFT', right: 'RIGHT', foot: 'FOOT' }
  assert.equal(containerFor({ id: 'x' }, containers), 'RIGHT')
  assert.equal(containerFor({ id: 'y', band: 'nonsense' }, containers), 'RIGHT')
  assert.doesNotThrow(() => containerFor(null, containers))
  assert.equal(containerFor(null, containers), 'RIGHT')
  assert.equal(containerFor(undefined, containers), 'RIGHT')
  assert.doesNotThrow(() => containerFor({ band: 'left' }))
})

test('nextInCycle wraps around a list of eligible views', () => {
  assert.equal(nextInCycle(['status', 'shortcuts'], 'status'), 'shortcuts')
  assert.equal(nextInCycle(['status', 'shortcuts'], 'shortcuts'), 'status')
})

test('nextInCycle is a no-op with fewer than two candidates', () => {
  assert.equal(nextInCycle(['status'], 'status'), 'status')
  assert.equal(nextInCycle([], 'status'), 'status')
})

test('nextInCycle falls back to the first candidate when current is not one', () => {
  assert.equal(nextInCycle(['status', 'shortcuts'], 'notepad'), 'status')
})

function fakeElement() {
  const el = {
    children: [],
    dataset: {},
    className: '',
    appendChild(child) { this.children.push(child); return child },
    removeChild(child) {
      // Mirrors ChildNode.remove()'s forgiving contract rather than the
      // classic Node.removeChild(), which throws on a child that is not
      // present: a defensive double should not throw where the real DOM
      // wouldn't have to.
      const i = this.children.indexOf(child)
      if (i !== -1) this.children.splice(i, 1)
      return child
    },
    replaceChildren() { this.children = [] },
  }
  return el
}
