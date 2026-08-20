// The five "Effets" toggles (core-settings.js, schema.js's `effects`) had no
// code behind them for a long while — the panel exposed inert
// checkboxes. This module is the missing half: one class per enabled effect,
// applied to <body> so effects.css (a single stylesheet, no inline styles)
// can key every rule off it.

const PREFIX = 'fx-'

// Derived from whatever keys the config actually carries, never a hand-kept
// list: a sixth effect added to schema.js's defaults().effects gets a class
// here with nothing else to update.
export function effectClasses(effects) {
  return Object.keys(effects)
    .filter((key) => effects[key])
    .map((key) => `${PREFIX}${key}`)
}

// body.classList is spread, never read as `classList.values` — a
// DOMTokenList is iterable (Symbol.iterator), not an object exposing its
// entries through a plain property, and a test double that only pretends
// otherwise would pass here yet throw against a real browser. add()/remove()
// are the only other calls made, both real DOMTokenList methods, so this
// runs unchanged against the real thing.
export function applyEffects(body, effects) {
  const next = effectClasses(effects)
  const current = [...body.classList]
  const stale = current.filter((cls) => cls.startsWith(PREFIX) && !next.includes(cls))
  body.classList.remove(...stale)
  body.classList.add(...next)
}
