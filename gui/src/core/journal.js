// No '> ALL SYSTEMS NOMINAL' here any more: the right column's verdict says
// that, and says it about the deck's actual state rather than as a fixed
// boot message. Two claims about the same thing, one of them unconditional,
// is one too many — and the unconditional one is the wrong one to keep.
const BOOT = [
  '> CIPHER-2 CORE ONLINE',
  '> NEURAL LATTICE: OK',
  '> LINK HANDSHAKE: OK',
]

export function bootLines() {
  return [...BOOT]
}

// No model, no inference: a handful of rules over the state the deck already
// has. CIPHER-2 speaks only when there is something to say.
//
// Never throws — not even if `state` is present but hostile: optional
// chaining (`state?.battery`) only guards a missing `state`, not a property
// that is itself a getter which raises when read. schema.js's validate()
// guards the same class of threat with the same try/catch-per-unit idiom,
// with the same reasoning: telemetry replaces today's stub state with real
// telemetry that can be partial or malformed, and a bad reading must degrade
// the journal to silence, not take the settings-change listener down with it
// (main.js's store.subscribe calls every module's listener in one loop; an
// uncaught throw here would abort that loop mid-iteration for every module
// after this one, not just this one).
// Shared by stateLines and verdictLine so the two can never disagree about
// what "critical" means — they are read one above the other in the same
// column, and a threshold kept in two places is a threshold that eventually
// differs. Returns the percentage when it qualifies, null otherwise; the
// caller decides what to say about it.
const CRITICAL_PERCENT = 15

function criticalBattery(state) {
  const battery = state?.battery
  const percent = typeof battery?.percent === 'number' && Number.isFinite(battery.percent)
    ? battery.percent
    : null
  if (percent === null || percent > CRITICAL_PERCENT || battery.charging) return null
  return Math.round(percent)
}

export function stateLines(state) {
  try {
    const out = []
    const critical = criticalBattery(state)

    if (state?.link === 'offline') out.push('> LINK LOST — RUNNING BLIND')
    else out.push('> LINK ACTIVE')

    if (critical !== null) out.push(`> BATTERY CRITICAL: ${critical}%`)
    else if (state?.battery?.charging) out.push('> BATTERY CHARGING')

    return out
  } catch {
    return []
  }
}

// Thresholds for the verdict below, gathered here rather than inlined so the
// numbers this deck calls "wrong" can be read in one place and changed
// without hunting. Each is the point past which a reading stops being
// something you glance at and becomes something you act on.
const STORAGE_LOW_FRACTION = 0.08
const MEMORY_HIGH_FRACTION = 0.9
const CPU_HIGH_LOAD = 0.85

const ratio = (part, whole) =>
  (Number.isFinite(part) && Number.isFinite(whole) && whole > 0 ? part / whole : null)

// Worst first: only one sentence is ever shown, so the order here is the
// order in which these matter. A lost link outranks everything, because with
// it every reading below is a memory rather than a measurement.
function verdictClause(state) {
  if (state?.link === 'offline') return 'Link lost, running blind'

  const critical = criticalBattery(state)
  if (critical !== null) return `Battery critical at ${critical}%`

  const freeFraction = ratio(state?.storage?.free_gb, state?.storage?.total_gb)
  if (freeFraction !== null && freeFraction < STORAGE_LOW_FRACTION) {
    return `Storage almost full, ${state.storage.free_gb} GB left`
  }

  const usedFraction = ratio(state?.memory?.used_mb, state?.memory?.total_mb)
  if (usedFraction !== null && usedFraction > MEMORY_HIGH_FRACTION) {
    return `Memory nearly exhausted at ${Math.round(usedFraction * 100)}%`
  }

  const load = state?.cpu?.load
  if (Number.isFinite(load) && load > CPU_HIGH_LOAD) {
    return `Running hot, load at ${Math.round(load * 100)}%`
  }

  return 'All systems nominal'
}

// The right column's closing verdict, under its separator rule — the
// reference photo's "All systems nominal, Operator." One sentence, left to
// wrap on its own in a narrow column exactly as it does there.
//
// It reports rather than reassures. "Nominal" is a claim about the deck, and
// the deck is sometimes not nominal, so every reading the status column shows
// can contradict it. The catch is that reasoning taken to its end: a state
// that cannot be read at all is the circumstance in which we know least, and
// so the last place to assert that everything is fine.
//
// The address is appended here, once, rather than written into each clause:
// it is a property of the sentence, not of any particular verdict, and this
// is what makes it impossible for a clause added later to forget it.
export function verdictLine(state) {
  try {
    return `${verdictClause(state)}, Operator.`
  } catch {
    return 'Status unreadable, Operator.'
  }
}
