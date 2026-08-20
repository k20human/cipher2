import { STORAGE_KEY, defaults, validate } from './schema.js'

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

// Writes into a plain clone at a dotted path. Returns false if the path does
// not already exist, so a typo cannot invent a field validate() would drop.
// Uses Object.hasOwn rather than `in`, which walks the prototype chain and
// would otherwise let a path like "theme.__proto__.toString" traverse onto
// Object.prototype itself.
function setPath(target, path, value) {
  const parts = path.split('.')
  let node = target
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, part)) return false
    node = node[part]
  }
  const last = parts[parts.length - 1]
  if (node === null || typeof node !== 'object' || !Object.hasOwn(node, last)) return false
  node[last] = value
  return true
}

function readStorage(storage) {
  if (!storage) return null
  try {
    return storage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function createStore({ storage = globalThis.localStorage ?? null, newId } = {}) {
  const opts = newId ? { newId } : {}
  let persistent = Boolean(storage)
  let config

  const raw = readStorage(storage)
  if (raw === null) {
    config = defaults()
  } else {
    try {
      config = validate(JSON.parse(raw), opts)
    } catch {
      config = defaults()
    }
  }
  deepFreeze(config)

  const listeners = new Set()

  function commit(next) {
    config = deepFreeze(validate(next, opts))
    if (storage) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(config))
      } catch {
        // A full or disabled storage must not break the launcher. We keep the
        // config in memory and let the UI say so.
        persistent = false
      }
    }
    for (const fn of listeners) fn(config)
  }

  return {
    get: () => config,
    get persistent() { return persistent },

    set(path, value) {
      const draft = structuredClone(config)
      if (!setPath(draft, path, value)) return
      commit(draft)
    },

    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },

    toJSON() {
      return JSON.stringify(config, null, 2)
    },

    fromJSON(t) {
      let parsed
      try {
        parsed = JSON.parse(t)
      } catch (err) {
        return { ok: false, error: err.message }
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: 'expected a JSON object' }
      }
      commit(parsed)
      return { ok: true }
    },

    reset() {
      commit(defaults())
    },
  }
}
