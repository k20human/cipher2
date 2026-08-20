export function resolveOrder(order, availableIds) {
  const seen = new Set()
  return (Array.isArray(order) ? order : []).filter((id) => {
    if (seen.has(id) || !availableIds.includes(id)) return false
    seen.add(id)
    return true
  })
}

// Maps a module definition to the container it mounts into, given the
// deck's band containers. A module declares its own home via a `band` field
// (e.g. cipher.js's `band: 'left'`, clock.js's `band: 'foot'`); a module
// with no `band` field — shortcuts.js today — mounts into `right`, the
// deck's default band. An unrecognised or missing band degrades the same
// way rather than throwing, since a typo here must not blank the module
// entirely; `def` itself may be null/undefined too (an id with no
// registered module behind it), handled the same way.
//
// This replaces a hand-maintained set of ids that used to live in main.js
// (LEFT_BAND_MODULES) with no shared source of truth tying it to the
// registry or to schema.js's MODULE_IDS — a module could land in one list
// and be forgotten in the other with no error, just a module silently
// mounted in the wrong band or not at all. Declaring the band on the module
// definition itself removes the second list: there is nothing left to keep
// in sync by hand.
export function containerFor(def, { left, right, foot } = {}) {
  if (def?.band === 'left') return left
  if (def?.band === 'foot') return foot
  return right
}

// Cycles to the next id in an already-filtered list (e.g. the right band's
// own subset of layout.order), wrapping around. Fewer than two candidates
// means there is nothing to cycle to, so `current` is returned unchanged —
// a single enabled right-band view, or none, can never "cycle" into a blank
// right band. `current` need not be a member of `ids` (it may have just been
// disabled, or be the schema default before anything has ever mounted): the
// modulo of indexOf's -1 lands on index 0, the same place a fresh boot would.
export function nextInCycle(ids, current) {
  if (ids.length < 2) return current
  const at = ids.indexOf(current)
  return ids[(at + 1) % ids.length]
}

export function createRegistry(definitions) {
  const index = new Map(definitions.map((def) => [def.id, def]))
  return {
    byId: (id) => index.get(id),
    all: () => [...index.values()],
    ids: () => [...index.keys()],
  }
}

// Mounts each module into its own host element. A module that throws is
// skipped and reported: one broken tile must not blank the whole launcher.
// `doc` defaults through globalThis so importing this file under Node — where
// `document` is not merely absent but undeclared — does not throw.
export function mountModules(registry, order, container, makeContext, doc = globalThis.document) {
  const mounted = []
  for (const id of resolveOrder(order, registry.ids())) {
    const def = registry.byId(id)
    const host = doc?.createElement ? doc.createElement('section') : { dataset: {}, style: {} }
    host.dataset.module = id
    host.className = `module module--${id}`
    container.appendChild(host)
    try {
      def.mount(host, makeContext(def))
      mounted.push(def)
    } catch (err) {
      console.error(`module ${id} failed to mount`, err)
      // The host went in before mount() ran — a module reasonably expects an
      // attached node while measuring or focusing. On failure it must come
      // back out again, or the empty tile lingers for the rest of the session.
      container.removeChild(host)
    }
  }
  return () => {
    for (const def of mounted) {
      try {
        def.unmount()
      } catch (err) {
        console.error(`module ${def.id} failed to unmount`, err)
      }
    }
    container.replaceChildren()
  }
}
