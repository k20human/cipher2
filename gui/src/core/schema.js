export const CONFIG_VERSION = 1
export const STORAGE_KEY = 'cyberdeck.config.v1'

export const THEME_NAMES = ['matrix', 'nightcity', 'arasaka']
export const GLYPH_SETS = ['katakana', 'hex', 'ascii']
export const CLOCK_SIZES = ['small', 'medium', 'large']
// 'auto' lets shortcuts.js's bestFit choose, which is what makes the grid fit
// the band instead of scrolling out of it. The fixed counts stay offered
// because the choice is still the user's — they are honoured as given, and
// only the tile size is computed for them.
export const GRID_COLUMNS = ['auto', '2', '3', '4']
// 'white' first because it is the default: the reference photo draws its
// content in white and keeps the palette for the frame around it. 'theme'
// points it back at --fg, which is what the deck looked like before.
export const INK_MODES = ['white', 'theme']
export const LOGO_STYLES = ['glitch', 'plate', 'frame', 'major']
export const MODULE_IDS = ['cipher', 'clock', 'status', 'shortcuts']
// 'column' confines the rain to the right band (see main.js's setupAmbient
// and base.css's #ambient grid-area); 'fullscreen' is the "full Matrix"
// mode, which brings back the cost the first design warned about — see the
// README's Settings section.
export const AMBIENT_SCOPES = ['column', 'fullscreen']

export const LABEL_MAX = 32
export const ICON_MAX = 3
export const TARGET_MAX = 2048
export const AVATAR_ID_MAX = 32

export function defaults() {
  return {
    version: CONFIG_VERSION,
    theme: { name: 'matrix', hue: null },
    ambient: {
      enabled: true,
      scope: 'column',
      density: 0.6,
      speed: 0.3,
      trail: 0.6,
      glyphs: 'katakana',
      resolutionScale: 1.0,
      fpsCap: 30,
    },
    effects: { scanlines: true, grain: false, vignette: true, glitch: false, glow: false },
    layout: {
      columns: 'auto',
    ink: 'white',
    logoInk: 'white',
    avatarInk: 'white',
      clockSize: 'small',
      logoStyle: 'plate',
      order: ['cipher', 'clock', 'status', 'shortcuts'],
      // Which module is mounted in the right band — see registry.js's
      // nextInCycle and telemetry.js: the right band shows one view at a
      // time, and this is the one shown by default and on Escape.
      rightView: 'status',
    },
    modules: {
      cipher: { avatar: 'vortex', log: true },
      clock: { seconds: false },
      status: {
        intervalMs: 10000,
        ip: true, battery: true, wifi: true,
        // cpu is off by default — see status.js's own declaration, which this
        // mirrors and which a test holds to agreement: Android gives an
        // unprivileged app no way to read system CPU load, so on this deck's
        // hardware the line can only read N/A.
        cpu: false, memory: true, storage: true, uptime: false, link: true,
      },
      shortcuts: {
        items: [
          { id: 'yt-music', label: 'YT Music', target: 'https://music.youtube.com/', icon: '♫', accent: '' },
          { id: 'meteo', label: 'Météo', target: 'https://meteofrance.com/', icon: '≋', accent: '' },
          { id: 'actu', label: 'Actu', target: 'https://news.google.com/', icon: '▤', accent: '' },
          { id: 'termux', label: 'Termux', target: 'intent://#Intent;package=com.termux;end', icon: '>_', accent: '' },
        ],
      },
    },
  }
}

const bool = (v, d) => (typeof v === 'boolean' ? v : d)

const num = (v, d, min, max) =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d)

const int = (v, d, min, max) =>
  (Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : d)

const oneOf = (v, d, allowed) => (allowed.includes(v) ? v : d)

const text = (v, d, max) => (typeof v === 'string' ? v.slice(0, max) : d)

const obj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {})

// Intl.Segmenter is built into Node 22 and every browser this targets, so no
// dependency. `.slice()` counts UTF-16 units: a flag emoji is 4 of them, and
// cutting at 3 leaves a lone surrogate that renders as an empty box.
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function truncateGraphemes(value, max) {
  if (typeof value !== 'string' || value === '') return ''
  const out = []
  for (const { segment } of segmenter.segment(value)) {
    if (out.length >= max) break
    out.push(segment)
  }
  return out.join('')
}

// Schemes a shortcut target must never carry: shortcuts.js hands the target
// straight to an <a href> uninterpreted otherwise. Declared here, not in
// src/modules/shortcuts.js, because validateShortcut (below) is the one
// checkpoint every write to the store passes through — a shortcut created
// via the editor, one edited in place, and one arriving through a JSON
// import all end up here. Only creation used to also route through
// shortcuts.js's own normalizeTarget, which left an in-place edit (the
// editor's patch()) and a config import (store.fromJSON) unchecked: both
// write straight to the store, never through normalizeTarget. schema.js
// must not import from src/modules/, so normalizeTarget now imports this
// constant instead of keeping its own copy.
export const REFUSED_SCHEMES = /^(javascript|data|vbscript|file):/i

// accent is arbitrary text handed straight to a CSS custom property
// (shortcuts.js's tile.style.setProperty('--accent', …)), read back wherever
// a rule uses var(--accent) — the same shape as a shortcut target, and the
// same reason it belongs here rather than left to shortcuts.js alone: this is
// the one checkpoint every write to the store shares. Harmless today only
// because no such rule sits in a property that accepts url() — a positional
// guarantee, not a real one. An allowlist of plausible CSS colour syntax
// (hex, a bare keyword, or rgb/rgba/hsl/hsla with only numeric arguments)
// rather than a blocklist: unlike a scheme prefix, arbitrary CSS colour
// syntax has no small fixed set of dangerous forms to exclude.
export const ACCENT_FORMAT = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]+|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s]+\))$/i

function validateShortcut(raw, newId) {
  const src = obj(raw)
  const target = text(src.target, '', TARGET_MAX).trim()
  if (!target || REFUSED_SCHEMES.test(target)) return null
  const accent = text(src.accent, '', 32)
  return {
    id: text(src.id, '', 64) || newId(),
    label: text(src.label, '', LABEL_MAX),
    target,
    icon: truncateGraphemes(typeof src.icon === 'string' ? src.icon : '', ICON_MAX),
    accent: accent === '' || ACCENT_FORMAT.test(accent) ? accent : '',
  }
}

// Never throws — not even if a section is a hostile getter that raises when
// read. Each section (theme, ambient, effects, layout, modules) is rebuilt
// inside its own try/catch, so an exception there costs only that section,
// never its siblings. Within a sound section, every field is rebuilt from
// the default and overwritten only if the incoming value is sound — a
// corrupt field costs its own value, nothing more. A launcher must not fail
// to start over a bad number, or a hostile one.
export function validate(raw, { newId = () => crypto.randomUUID() } = {}) {
  const src = obj(raw)
  const out = defaults()

  try {
    const theme = obj(src.theme)
    out.theme.name = oneOf(theme.name, out.theme.name, THEME_NAMES)
    out.theme.hue = theme.hue === null || theme.hue === undefined
      ? null
      : (Number.isInteger(theme.hue) && theme.hue >= 0 && theme.hue <= 359 ? theme.hue : null)
  } catch { /* theme falls back to its defaults */ }

  try {
    const amb = obj(src.ambient)
    out.ambient.enabled = bool(amb.enabled, out.ambient.enabled)
    out.ambient.scope = oneOf(amb.scope, out.ambient.scope, AMBIENT_SCOPES)
    out.ambient.density = num(amb.density, out.ambient.density, 0.05, 1)
    out.ambient.speed = num(amb.speed, out.ambient.speed, 0.05, 1)
    out.ambient.trail = num(amb.trail, out.ambient.trail, 0.05, 1)
    out.ambient.glyphs = oneOf(amb.glyphs, out.ambient.glyphs, GLYPH_SETS)
    out.ambient.resolutionScale = num(amb.resolutionScale, out.ambient.resolutionScale, 0.5, 2)
    out.ambient.fpsCap = int(amb.fpsCap, out.ambient.fpsCap, 10, 60)
  } catch { /* ambient falls back to its defaults */ }

  try {
    const fx = obj(src.effects)
    for (const key of Object.keys(out.effects)) {
      out.effects[key] = bool(fx[key], out.effects[key])
    }
  } catch { /* effects fall back to their defaults */ }

  try {
    const layout = obj(src.layout)
    // A string enum, not an int range: 'auto' is the default and has no
    // numeric value to fall between 2 and 4. A config stored before this
    // change holds the number 2, which is not in GRID_COLUMNS and so falls
    // back to 'auto' — the right outcome, since 2 was the old default and
    // nobody choosing it was asking not to have the grid fit.
    out.layout.columns = oneOf(layout.columns, out.layout.columns, GRID_COLUMNS)
    out.layout.ink = oneOf(layout.ink, out.layout.ink, INK_MODES)
    out.layout.logoInk = oneOf(layout.logoInk, out.layout.logoInk, INK_MODES)
    out.layout.avatarInk = oneOf(layout.avatarInk, out.layout.avatarInk, INK_MODES)
    out.layout.clockSize = oneOf(layout.clockSize, out.layout.clockSize, CLOCK_SIZES)
    out.layout.logoStyle = oneOf(layout.logoStyle, out.layout.logoStyle, LOGO_STYLES)
    // Validated against MODULE_IDS, the same enumeration layout.order uses,
    // rather than a separate "right-band views" list: which ids actually
    // resolve to the right band is core/registry.js's containerFor's call,
    // not schema.js's, and an id that turns out not to be one degrades the
    // same way any other unknown id would — mountAll falls back to the first
    // eligible module rather than throwing.
    out.layout.rightView = oneOf(layout.rightView, out.layout.rightView, MODULE_IDS)
    if (Array.isArray(layout.order)) {
      // Single pass, first-occurrence order kept, via a Set rather than the
      // quadratic filter+indexOf: a large pasted config must not freeze the tab.
      const seen = new Set()
      const order = []
      for (const id of layout.order) {
        if (MODULE_IDS.includes(id) && !seen.has(id)) {
          seen.add(id)
          order.push(id)
        }
      }
      out.layout.order = order
    }
  } catch { /* layout falls back to its defaults */ }

  try {
    const mods = obj(src.modules)
    // Bounded string only, never checked against the avatar registry: schema.js
    // must not depend on src/ai/, so an unknown id is accepted here and it is
    // mountAvatar's job, not this one's, to fall back to the first avatar.
    const cipher = obj(mods.cipher)
    out.modules.cipher.avatar = text(cipher.avatar, out.modules.cipher.avatar, AVATAR_ID_MAX)
    out.modules.cipher.log = bool(cipher.log, out.modules.cipher.log)

    const clock = obj(mods.clock)
    out.modules.clock.seconds = bool(clock.seconds, out.modules.clock.seconds)

    const status = obj(mods.status)
    out.modules.status.intervalMs = int(status.intervalMs, out.modules.status.intervalMs, 2000, 60000)
    for (const key of ['ip', 'battery', 'wifi', 'cpu', 'memory', 'storage', 'uptime', 'link']) {
      out.modules.status[key] = bool(status[key], out.modules.status[key])
    }

    const shortcuts = obj(mods.shortcuts)
    if (Array.isArray(shortcuts.items)) {
      out.modules.shortcuts.items = shortcuts.items
        .map((item) => {
          try {
            return validateShortcut(item, newId)
          } catch {
            // A failure building this one shortcut — including newId()
            // throwing — costs only this shortcut, not the list or the rest
            // of the config.
            return null
          }
        })
        .filter((item) => item !== null)
    }
  } catch { /* modules fall back to their defaults */ }

  return out
}
