import { createStore } from './core/store.js'
import { defaults } from './core/schema.js'
import { resolveTheme, applyTheme } from './core/theme.js'
import { createRegistry, mountModules, containerFor, nextInCycle } from './core/registry.js'
import { createEngine } from './ambient/engine.js'
import { createRain } from './ambient/rain.js'
import { applyEffects } from './core/effects.js'
import { createPanel } from './settings/panel.js'
import { renderLogo } from './modules/logo.js'
import cipher from './modules/cipher.js'
import clock from './modules/clock.js'
import status, { getDeckState as statusDeckState } from './modules/status.js'
import shortcuts from './modules/shortcuts.js'
import { setupFullscreen } from './core/fullscreen.js'

// Not yet a setting anywhere: the device this build is named for.
const DEVICE_NAME = 'CIPHER-2'

const store = createStore()
const registry = createRegistry([cipher, clock, status, shortcuts])

const canvas = document.getElementById('ambient')
const logoHost = document.getElementById('logo')
const leftContainer = document.getElementById('zone-modules-left')
const rightContainer = document.getElementById('zone-modules')
const footContainer = document.getElementById('zone-modules-foot')

// Each module declares its own band (cipher.js: 'left', clock.js: 'foot');
// core/registry.js's containerFor reads that field and defaults to right.
// This used to be a hand-maintained set here (LEFT_BAND_MODULES) plus a
// hardcoded `id === 'clock'` check, neither tied to MODULE_IDS (schema.js)
// or the registry array above by anything the language enforced — a module
// id could land in one list and be forgotten in another with no error, just
// a module silently mounted in the wrong band. See containerFor's own
// comment for the full reasoning; nothing left to keep in sync here.
const containers = { left: leftContainer, right: rightContainer, foot: footContainer }

// Resolving the container is not enough on its own: a host is never
// relocated after mounting, since a host moved out of the container
// mountModules owns becomes invisible to that container's replaceChildren()
// on a later remount (reachable from any layout.order change), leaving a
// second live host mounted while the first is orphaned. Mounting straight
// into the right container from the start (below, in mountAll and
// mountRight) makes that bug structurally impossible: every host always
// lives where its own teardown can find it.

// The right band's own subset of layout.order — the candidates layout.rightView
// cycles through. Recomputed rather than cached: it must reflect the current
// order (a module can be toggled off in the settings panel at any time).
function rightBandIds() {
  const { order } = store.get().layout
  return order.filter((id) => containerFor(registry.byId(id), containers) === rightContainer)
}

// The right band shows exactly one view at a time — the design rule is "the
// right column is a screen, not a stack". These two are the whole mechanism:
// each view's own tappable prompt calls one of them, and the global
// Enter/Escape listener below calls the very same functions, so the key and
// the tap are provably the same action, never two.
function nextView() {
  store.set('layout.rightView', nextInCycle(rightBandIds(), store.get().layout.rightView))
}

function resetView() {
  store.set('layout.rightView', defaults().layout.rightView)
}

let colors = resolveTheme(store.get().theme.name, store.get().theme.hue)

const deckEl = document.getElementById('deck')
const rightBand = document.querySelector('.band--right')

let engine = null
let ambientObserver = null

// engine.js captures `win` once, at createEngine() time, and has no setter
// for it — the same reason nexus.js builds a fresh engine per mount() rather
// than reconfiguring one in place. Column scope confines measurement to the
// right band via a `win` substitute, exactly like the canvas avatars;
// fullscreen measures the real window. teardownAmbient() runs unconditionally
// before every (re)build, so switching scope back and forth can never leave
// a second engine drawing into a detached canvas, or a second observer
// watching the band — the class of leak this project has hit before (see
// nexus.js's own mount() guard).
function teardownAmbient() {
  ambientObserver?.disconnect()
  ambientObserver = null
  engine?.stop()
  engine = null
}

function setupAmbient(scope) {
  teardownAmbient()
  // Moves the element itself, the same way nexus.js nests a canvas inside
  // an avatar host, rather than sharing .band--right's grid area from
  // outside it — see base.css's #ambient comment for why sharing the area
  // fed the canvas's own buffer size back into the band's layout and ran
  // away. Column: first child of .band--right, ahead of #zone-modules, so
  // it paints under it. Fullscreen: back to <body>, ahead of #deck, its
  // original spot before ambient.scope existed.
  if (scope === 'column') {
    rightBand.insertBefore(canvas, rightBand.firstChild)
  } else {
    document.body.insertBefore(canvas, deckEl)
  }
  const win = scope === 'column'
    ? { get innerWidth() { return rightBand.clientWidth }, get innerHeight() { return rightBand.clientHeight } }
    : window
  engine = createEngine({
    canvas,
    effect: createRain(),
    getConfig: () => store.get().ambient,
    getColors: () => colors,
    win,
  })
  if (scope === 'column') {
    // engine.js only re-measures from start()/setConfig(), and nothing calls
    // either when the right band itself changes size later. Watching it
    // directly — rather than changing engine.js — is the same call nexus.js
    // makes for an avatar host, kept local to the scope that needs it.
    ambientObserver = new ResizeObserver(() => engine.resize())
    ambientObserver.observe(rightBand)
  }
  engine.start()
}

// Module settings changes are broadcast per module id; each mounted module
// subscribes to its own slice and never sees another module's changes.
const settingsListeners = new Map()

// Telemetry updates happen entirely outside the store (status.js's polling
// is plain module state, not a settings change), so they need their own,
// separate broadcast: without it, cipher's journal would only ever reflect
// whatever getDeckState() happened to return at cipher's own mount time —
// stale for the entire session, since nothing would ever tell it to look
// again. Any module can subscribe; today only cipher.js's journal does.
const deckStateListeners = new Set()

// Layout settings are not module settings, so settingsListeners never carries
// them: a module that renders differently per layout.columns would otherwise
// only find out on the next unrelated change to its own settings. Same shape
// as deckStateListeners above, for the same reason.
const layoutListeners = new Set()

function notifyDeckStateChange() {
  for (const fn of deckStateListeners) fn()
}

function makeContext(def) {
  return {
    get settings() { return store.get().modules[def.id] },
    onSettingsChange(fn) {
      if (!settingsListeners.has(def.id)) settingsListeners.set(def.id, new Set())
      settingsListeners.get(def.id).add(fn)
    },
    setSetting(key, value) { store.set(`modules.${def.id}.${key}`, value) },
    openEditor(id) { panel.openShortcutEditor(id) },
    getAmbient: () => store.get().ambient,
    getLayout: () => store.get().layout,
    onLayoutChange(fn) {
      layoutListeners.add(fn)
      return () => layoutListeners.delete(fn)
    },
    onDeckStateChange(fn) {
      deckStateListeners.add(fn)
      return () => deckStateListeners.delete(fn)
    },
    notifyDeckStateChange,
    getColors: () => colors,
    getDeckState: () => statusDeckState(),
    nextView,
    resetView,
  }
}

// Groups layout.order by resolved container and calls mountModules once per
// distinct container, with the ids that belong there, in order. The right
// container is deliberately skipped here: mountRight below is its one and
// only mounting path, so the two can never both try to populate it.
// mountModules stays the only mounting mechanism there is — this just calls
// it once per container instead of once for the whole page.
function mountAll() {
  const { order } = store.get().layout
  const groups = new Map()
  for (const id of order) {
    const container = containerFor(registry.byId(id), containers)
    if (!container || container === rightContainer) continue
    if (!groups.has(container)) groups.set(container, [])
    groups.get(container).push(id)
  }
  const teardowns = [...groups.entries()]
    .map(([container, ids]) => mountModules(registry, ids, container, makeContext))
  return () => { for (const fn of teardowns) fn() }
}

let teardown = mountAll()

// The right band's own mount, kept independent of the left/foot teardown
// above: this is the path Enter/Escape run on every switch, so it must never
// touch the avatar's canvas engine or the footer clock's interval — polling
// has to survive a remount.
let rightTeardown = () => {}

function mountRight() {
  const ids = rightBandIds()
  const { rightView } = store.get().layout
  const active = ids.includes(rightView) ? rightView : ids[0]
  rightTeardown = mountModules(registry, active ? [active] : [], rightContainer, makeContext)
}

// Tears down only the currently-mounted right-band module and mounts the new
// one — a full remount() would also restart the left band's avatar and the
// footer clock on every single view switch, which is exactly the kind of
// needless interval churn this project has been bitten by before. The
// settings listeners dropped are every right-band id's (by id, not the whole
// map), not only the one that was actually mounted: rightBandIds() has no
// record of which of its own candidates that was, and deleting an id that was
// never registered is a harmless no-op, since only one right-band module is
// ever mounted at a time. cipher's and clock's listeners are untouched
// either way, since their bands were never torn down.
function remountRight() {
  rightTeardown()
  for (const id of rightBandIds()) settingsListeners.delete(id)
  mountRight()
}

mountRight()

function remount() {
  teardown()
  rightTeardown()
  settingsListeners.clear()
  teardown = mountAll()
  mountRight()
}

// --columns is gone from here: the shortcuts grid no longer takes its column
// count from a CSS variable. It cannot — the count and the tile size are one
// decision now, made against the band's height as well as its width, and that
// is arithmetic CSS has no way to do. shortcuts.js reads layout.columns
// through getLayout() and writes the answer onto the grid itself.
// The palette carries the ink so the canvas avatars can reach it: they draw
// with a colour string, not a CSS variable, and engine.js re-reads getColors()
// every frame — so writing it here is all it takes for them to follow. The CSS
// side reads the body attributes instead (theme.css's --ink / --logo-ink);
// the two have to be set together, which is why neither lives on its own.
function applyInk(layout) {
  document.body.dataset.ink = layout.ink
  document.body.dataset.logoInk = layout.logoInk
  document.body.dataset.avatarInk = layout.avatarInk
  // Only the avatar's reaches the palette object: it is the one of the three
  // that something outside CSS has to read. The other two are wanted by
  // stylesheets alone, and putting them here as well would be two more values
  // to keep in step with the attributes for no reader.
  colors.avatarInk = layout.avatarInk === 'theme' ? colors.fg : '#ffffff'
}

function applyLayout(layout) {
  applyInk(layout)
  document.body.dataset.clockSize = layout.clockSize
  for (const fn of layoutListeners) fn(layout)
}

let previous = store.get()

// Every commit rebuilds the whole config, so reference equality would report
// that everything changed on every keystroke — and remount the modules under
// a moving slider. These slices are tiny; comparing their JSON is honest and
// cheap.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

store.subscribe((config) => {
  if (!same(config.theme, previous.theme)) {
    colors = resolveTheme(config.theme.name, config.theme.hue)
    applyTheme(document.documentElement, colors)
    // resolveTheme hands back a fresh object, so the ink written onto the last
    // one is gone with it. Without this, switching palette while the ink is on
    // "theme" leaves the canvas avatars drawing in the previous palette's
    // colour until some unrelated layout change happens to write it again.
    applyInk(config.layout)
  }
  if (config.ambient.scope !== previous.ambient.scope) {
    setupAmbient(config.ambient.scope)
  } else if (!same(config.ambient, previous.ambient)) {
    engine.setConfig()
  }
  if (!same(config.effects, previous.effects)) applyEffects(document.body, config.effects)
  if (!same(config.layout, previous.layout)) applyLayout(config.layout)
  if (config.layout.logoStyle !== previous.layout.logoStyle) {
    renderLogo(logoHost, config.layout.logoStyle, DEVICE_NAME)
  }
  if (!same(config.layout.order, previous.layout.order)) {
    remount()
  } else if (config.layout.rightView !== previous.layout.rightView) {
    // mountRight() inside remount() above already reads the fresh rightView,
    // so this branch only fires when order itself is unchanged — no double
    // mount of the right band for the same commit.
    remountRight()
  }
  for (const [id, fns] of settingsListeners) {
    if (!same(config.modules[id], previous.modules[id])) {
      for (const fn of fns) fn(config.modules[id])
    }
  }
  previous = config
})

applyTheme(document.documentElement, colors)
applyLayout(store.get().layout)
renderLogo(logoHost, store.get().layout.logoStyle, DEVICE_NAME)
applyEffects(document.body, store.get().effects)

const panel = createPanel({ store, registry })
document.getElementById('open-settings').addEventListener('click', () => panel.open())
setupFullscreen(document.getElementById('go-fullscreen'))

// A focused control with its own native Enter/Space activation — a text
// field, a select, a button (including a view-prompt's own button, which
// already calls nextView()/resetView() from its click handler) — is left
// alone: acting here too would double-fire that control's own action for
// the very same keypress, and is exactly what would let Enter leak into the
// settings panel's text fields instead of being typed there.
const KEY_ACTIVATABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'])

function isKeyActivatable(el) {
  return Boolean(el) && (el.isContentEditable || KEY_ACTIVATABLE_TAGS.has(el.tagName))
}

document.addEventListener('keydown', (event) => {
  // The settings panel is a sibling overlay of #deck (panel.js appends it to
  // document.body), not a descendant any of this reaches through — checking
  // only document.activeElement missed it entirely: clicking a panel heading
  // (not itself focusable) drops focus back to <body>, which isKeyActivatable
  // waves through, so Enter used to cycle the view behind the open panel and
  // Escape reset it instead of closing the panel it looks like it belongs to.
  if (panel.isOpen) {
    if (event.key === 'Escape') panel.close()
    return
  }
  if (isKeyActivatable(document.activeElement)) return
  if (event.key === 'Enter') nextView()
  else if (event.key === 'Escape') resetView()
})

setupAmbient(store.get().ambient.scope)
window.addEventListener('resize', () => engine.setConfig())

if ('serviceWorker' in navigator) {
  // Reload once when a new worker takes over, so an update lands on the first
  // load rather than the second. sw.js calls skipWaiting() then clients.claim(),
  // which means the freshly installed worker adopts this page — but the page
  // itself is already running the previous version's HTML, CSS and modules,
  // and nothing would replace them until the next navigation. That gap was not
  // theoretical: it produced a page holding a new registry.js (a file the old
  // worker had never cached, so it came from the network) beside an old
  // avatars.css (a file it had), and the result was avatars whose animations
  // simply did not exist in the stylesheet.
  //
  // The guard matters. clients.claim() also fires controllerchange on a first
  // visit, when the page began life uncontrolled — reloading there would be a
  // reload on every first visit, for nothing. A page that already has a
  // controller is one where the change genuinely means "a newer version than
  // the one you are running has arrived".
  if (navigator.serviceWorker.controller) {
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })
  }
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.error('service worker registration failed', err)
  })
}
