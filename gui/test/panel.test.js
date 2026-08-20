import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CORE_SECTIONS } from '../src/settings/core-settings.js'
import { collectSections, toggleModule } from '../src/settings/panel.js'
import { defaults, THEME_NAMES, GLYPH_SETS, CLOCK_SIZES, AMBIENT_SCOPES } from '../src/core/schema.js'
import clock from '../src/modules/clock.js'
import shortcuts from '../src/modules/shortcuts.js'

function valueAt(config, path, key) {
  return path.split('.').reduce((node, part) => node[part], config)[key]
}

test('every core declaration is well formed', () => {
  const types = new Set(['bool', 'range', 'select', 'text', 'color'])
  for (const section of CORE_SECTIONS) {
    assert.ok(section.id && section.title && section.path, JSON.stringify(section))
    for (const decl of section.settings) {
      assert.ok(types.has(decl.type), `${section.id}.${decl.key}: ${decl.type}`)
      assert.ok(decl.key && decl.label, JSON.stringify(decl))
      if (decl.type === 'range') {
        assert.equal(typeof decl.min, 'number', decl.key)
        assert.equal(typeof decl.max, 'number', decl.key)
        assert.ok(decl.max > decl.min, decl.key)
      }
      if (decl.type === 'select') {
        assert.ok(Array.isArray(decl.options) && decl.options.length > 0, decl.key)
      }
    }
  }
})

test('every core declaration points at a real config field', () => {
  const config = defaults()
  for (const section of CORE_SECTIONS) {
    for (const decl of section.settings) {
      assert.notEqual(valueAt(config, section.path, decl.key), undefined,
        `${section.path}.${decl.key} is not in the schema`)
    }
  }
})

test('the enumerations offered match the schema exactly', () => {
  const find = (path, key) => CORE_SECTIONS
    .find((s) => s.path === path).settings.find((d) => d.key === key)
  assert.deepEqual(find('theme', 'name').options.map((o) => o.value), THEME_NAMES)
  assert.deepEqual(find('ambient', 'glyphs').options.map((o) => o.value), GLYPH_SETS)
  assert.deepEqual(find('ambient', 'scope').options.map((o) => o.value), AMBIENT_SCOPES)
  assert.deepEqual(find('layout', 'clockSize').options.map((o) => o.value), CLOCK_SIZES)
})

test('collectSections appends one section per module, after the core ones', () => {
  const sections = collectSections(CORE_SECTIONS, [clock, shortcuts], ['clock'])
  const ids = sections.map((s) => s.id)
  for (const core of CORE_SECTIONS) assert.ok(ids.includes(core.id), core.id)
  assert.ok(ids.indexOf('module:clock') > ids.indexOf(CORE_SECTIONS.at(-1).id))
  assert.ok(ids.includes('module:shortcuts'))
})

test('a module section knows whether it is currently mounted', () => {
  const sections = collectSections(CORE_SECTIONS, [clock, shortcuts], ['clock'])
  const byId = Object.fromEntries(sections.map((s) => [s.id, s]))
  assert.equal(byId['module:clock'].enabled, true)
  assert.equal(byId['module:shortcuts'].enabled, false)
})

test('a module section carries the module own path and declarations', () => {
  const section = collectSections(CORE_SECTIONS, [clock], ['clock'])
    .find((s) => s.id === 'module:clock')
  assert.equal(section.path, 'modules.clock')
  assert.deepEqual(section.settings, clock.settings)
})

test('toggleModule restores a module to its declared position, not the end', () => {
  // MODULE_IDS is the canonical order; re-enabling must not demote a module.
  const all = ['clock', 'shortcuts']
  const off = toggleModule(['clock', 'shortcuts'], 'clock', false, all)
  assert.deepEqual(off, ['shortcuts'])
  assert.deepEqual(toggleModule(off, 'clock', true, all), ['clock', 'shortcuts'])
})

test('toggleModule keeps the relative order of the survivors', () => {
  const all = ['a', 'b', 'c', 'd']
  const off = toggleModule(['a', 'b', 'c', 'd'], 'b', false, all)
  assert.deepEqual(off, ['a', 'c', 'd'])
  assert.deepEqual(toggleModule(off, 'b', true, all), ['a', 'b', 'c', 'd'])
})

test('toggleModule is idempotent', () => {
  assert.deepEqual(toggleModule(['clock'], 'clock', true, ['clock']), ['clock'])
  assert.deepEqual(toggleModule([], 'clock', false, ['clock']), [])
})

test('toggleModule refuses an id no module answers to', () => {
  assert.deepEqual(toggleModule(['clock'], 'weather', true, ['clock', 'shortcuts']), ['clock'])
})
