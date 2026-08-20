// Pure functions for interpreting the /api/status envelope (tools/status.py)
// and rendering it as fixed-width HUD lines. Follows schema.js's discipline
// exactly: never throw, validate field by field, and let one bad field cost
// only its own value — a hostile or malformed reading must degrade a single
// line, never the whole column, and never the page.
//
// Granularity note: unlike schema.js's scalar settings (which each have a
// sensible standalone default to fall back to), a telemetry reading has no
// meaningful per-field default — there is no "default" battery percentage.
// So the unit that survives or nulls as a whole here is the struct a line
// actually renders (battery, wifi, cpu, memory, storage): every field that
// formatLine needs to render that line must be valid, or the whole struct is
// null and the line shows N/A. A field formatLine never reads (temperature,
// link_speed) degrades on its own without nulling its parent, the same way
// an unused, corrupt field in schema.js costs only itself.

const MAX_STR = 128

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const numRange = (v, min, max) => {
  const n = num(v)
  return n !== null && n >= min && n <= max ? n : null
}

const bool = (v) => (typeof v === 'boolean' ? v : null)

const str = (v, maxLen = MAX_STR) => (typeof v === 'string' && v.length <= maxLen ? v : null)

function parseBattery(raw) {
  if (!isObj(raw)) return null
  const percent = numRange(raw.percent, 0, 100)
  const charging = bool(raw.charging)
  if (percent === null || charging === null) return null
  return { percent, charging, temperature: num(raw.temperature) }
}

function parseWifi(raw) {
  if (!isObj(raw)) return null
  const ssid = str(raw.ssid)
  const rssi = numRange(raw.rssi, -120, 0)
  if (ssid === null || rssi === null) return null
  return { ssid, rssi, link_speed: num(raw.link_speed) }
}

function parseCpu(raw) {
  if (!isObj(raw)) return null
  const load = numRange(raw.load, 0, 1)
  return load === null ? null : { load }
}

function parseMemory(raw) {
  if (!isObj(raw)) return null
  const used = num(raw.used_mb)
  const total = num(raw.total_mb)
  if (used === null || total === null || used < 0 || total <= 0 || used > total) return null
  return { used_mb: used, total_mb: total }
}

function parseStorage(raw) {
  if (!isObj(raw)) return null
  const free = num(raw.free_gb)
  const total = num(raw.total_gb)
  if (free === null || total === null || free < 0 || total <= 0 || free > total) return null
  return { free_gb: free, total_gb: total }
}

function parseUptime(raw) {
  const n = num(raw)
  return n !== null && n >= 0 ? n : null
}

function notOk() {
  return {
    ok: false, ts: null, ip: null, battery: null, wifi: null,
    cpu: null, memory: null, storage: null, uptime_s: null,
  }
}

// Each field is parsed inside its own try/catch: a hostile getter that
// throws on read (the same threat schema.js's validate() guards against)
// must cost only that one field, not the fields read before or after it.
function safe(fn) {
  try {
    return fn()
  } catch {
    return null
  }
}

// `raw` is untrusted input from a local HTTP response: it may be anything a
// hostile or broken server could send, not just the shapes above. `ok` is
// false whenever `raw` is not an exploitable object — including a plain
// object missing a usable `ts`, since every other function here (ageOf,
// isStale) is meaningless without one.
export function parseStatus(raw) {
  if (!isObj(raw)) return notOk()
  const ts = safe(() => num(raw.ts))
  if (ts === null) return notOk()
  return {
    ok: true,
    ts,
    ip: safe(() => str(raw.ip)),
    battery: safe(() => parseBattery(raw.battery)),
    wifi: safe(() => parseWifi(raw.wifi)),
    cpu: safe(() => parseCpu(raw.cpu)),
    memory: safe(() => parseMemory(raw.memory)),
    storage: safe(() => parseStorage(raw.storage)),
    uptime_s: safe(() => parseUptime(raw.uptime_s)),
  }
}

// `snapshot.ts` is whole seconds since the epoch (as tools/status.py emits
// it); `now` is a `Date.now()`-style millisecond timestamp, so the two units
// are reconciled here rather than at every call site.
export function ageOf(snapshot, now) {
  if (!snapshot || typeof snapshot.ts !== 'number' || !Number.isFinite(snapshot.ts)) return Infinity
  return Math.floor(now / 1000) - snapshot.ts
}

// "Exceeds" the ttl, deliberately — a snapshot exactly `ttl`
// seconds old is still the freshest thing we have, not yet stale.
export function isStale(snapshot, now, ttl) {
  return ageOf(snapshot, now) > ttl
}

// The parenthesised usage share both the memory and storage lines carry.
// Returns '' rather than '(NaN%)' on a total of zero — a device reporting no
// memory at all is not a device this should be inventing a figure for, and
// the pair of numbers in front of it already says everything that is known.
function share(used, total) {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return ''
  return ` (${Math.round((used / total) * 100)}%)`
}

const LABELS = {
  ip: 'IP', battery: 'BAT', wifi: 'WIFI', cpu: 'CPU',
  memory: 'MEM', storage: 'DISK', uptime: 'UPTIME', link: 'LINK',
}

// Six-character label field, then a fixed two-space gutter, then the value —
// so every line's value starts in the same column without a table. Widths
// verified by the formatLine tests above.
const LABEL_WIDTH = 6
const GUTTER = '  '

function formatUptime(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}D ${hours}H`
  if (hours > 0) return `${hours}H ${minutes}M`
  return `${minutes}M`
}

function formatValue(key, value) {
  if (value === null || value === undefined) return 'N/A'
  switch (key) {
    case 'ip':
      return typeof value === 'string' ? value : 'N/A'

    case 'battery': {
      if (!isObj(value) || !Number.isFinite(value.percent)) return 'N/A'
      const marker = value.source === 'browser' ? ' (NAV)' : ''
      return `${Math.round(value.percent)}%${value.charging ? ' ⚡' : ''}${marker}`
    }

    case 'wifi': {
      if (!isObj(value)) return 'N/A'
      const ssid = typeof value.ssid === 'string' && value.ssid ? value.ssid : 'N/A'
      const rssi = Number.isFinite(value.rssi) ? value.rssi : '?'
      return `${ssid}  ${rssi} dBm`
    }

    case 'cpu': {
      if (!isObj(value) || !Number.isFinite(value.load)) return 'N/A'
      return `${Math.round(value.load * 100)}%`
    }

    // Rendered in GB, though status.py reports MiB: a four- and five-digit
    // pair told the reader nothing at a glance that "24.4/30.5" does not, and
    // the storage line beside it was already in GB. The wire format keeps its
    // MiB — this is a display unit, not a change to what /api/status emits.
    // /1024, because the value really is MiB (MemTotal is kB, halved twice by
    // status.py); the storage line's own GB are SI, from a byte count over
    // 1e9. The two conventions differ upstream and are not reconciled here.
    case 'memory': {
      if (!isObj(value) || !Number.isFinite(value.used_mb) || !Number.isFinite(value.total_mb)) return 'N/A'
      const gb = (mb) => (mb / 1024).toFixed(1)
      return `${gb(value.used_mb)}/${gb(value.total_mb)} GB${share(value.used_mb, value.total_mb)}`
    }

    // Used, not free — a change from the free-space figure this line carried
    // before. The percentage asked for is a usage percentage, and "347.1 GB
    // free (65%)" reads as a contradiction unless you already know the 65%
    // refers to the other number. Both lines now say the same kind of thing:
    // how much is gone, out of how much there is.
    case 'storage': {
      if (!isObj(value) || !Number.isFinite(value.free_gb) || !Number.isFinite(value.total_gb)) return 'N/A'
      const used = value.total_gb - value.free_gb
      return `${used.toFixed(1)}/${value.total_gb} GB${share(used, value.total_gb)}`
    }

    case 'uptime': {
      const text = formatUptime(value)
      return text ?? 'N/A'
    }

    case 'link':
      return typeof value === 'string' ? value : 'N/A'

    default:
      return typeof value === 'string' || typeof value === 'number' ? String(value) : 'N/A'
  }
}

// Never throws: an unrecognised key still renders (its label is just its own
// uppercased name), and a value of the wrong shape renders as N/A rather
// than crashing the render loop that calls this once per visible line.
export function formatLine(key, value) {
  const label = (LABELS[key] ?? String(key).toUpperCase()).padEnd(LABEL_WIDTH)
  return `> ${label}${GUTTER}${formatValue(key, value)}`
}
