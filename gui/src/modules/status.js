import { parseStatus, ageOf, isStale, formatLine } from '../core/telemetry.js'
import { verdictLine } from '../core/journal.js'

// A snapshot older than this many poll intervals counts as stale on its own.
// The rule: the `link` line switches to `OFFLINE` as soon as a request fails
// or a snapshot exceeds three times the interval. This constant is only the
// second half of it — the silent-staleness path, which fires even when
// nothing has technically failed. The first half is lastFailed, below: a
// single failed request flips offline immediately, without waiting for this
// many intervals.
const OFFLINE_AFTER = 3

// Module-scope, not per-mount: switching the right view away and back is now
// routine (Enter/Escape), and that must not read as an outage. Only a fresh
// page load resets these — a real outage is tracked by lastFailed/isStale,
// not by throwing away what we already knew.
let lastSnapshot = null
let lastFailed = false
let batteryManager = null

// The current mount's own teardown. Reassigned by every mount() call so
// unmount() always tears down whichever instance is actually live; see the
// module-level comment in mount() for why the polling state itself cannot
// live up here alongside the telemetry it produces.
let teardown = () => {}

const LINE_KEYS = ['ip', 'battery', 'wifi', 'cpu', 'memory', 'storage', 'uptime', 'link']

// Browser battery only ever substitutes for the API's own reading, and only
// while the API is offline — a later successful poll simply stops calling
// this branch, so there is nothing to reconcile and nothing for the two
// sources to fight over.
function batteryFor(offline) {
  if (offline && batteryManager) {
    return {
      percent: Math.round(batteryManager.level * 100),
      charging: Boolean(batteryManager.charging),
      source: 'browser',
    }
  }
  return lastSnapshot?.battery ?? null
}

function valueFor(key, offline) {
  if (key === 'battery') return batteryFor(offline)
  if (key === 'link') return offline ? 'OFFLINE' : 'ONLINE'
  if (key === 'uptime') return lastSnapshot?.uptime_s ?? null
  return lastSnapshot?.[key] ?? null
}

// An aborted request is not a failed one: teardown() aborts in flight on
// every unmount, including the ordinary "glance at the status, press Enter"
// sequence this module exists to support, which races the very first poll
// mount() fires. That abort is information about navigation, not about the
// deck, and must leave no trace — not on lastFailed, and (since the catch
// this guards never touches it either) not on lastSnapshot. Exported so the
// one judgment call at the center of that distinction is unit-testable
// without mounting a fetch/AbortController/DOM lifecycle.
export function isRealFailure(err) {
  return err?.name !== 'AbortError'
}

// Read by main.js's own getDeckState, which the cipher module's journal
// consumes (journal.js's stateLines expects exactly this { link, battery }
// shape). Deliberately independent of any one mount: cipher's journal lives
// in the left band and stays mounted while the right band cycles away from
// status entirely, so this must keep answering from whatever was last known.
//
// Unlike the status column's own OFFLINE rule, this does not factor in
// elapsed time via isStale — only whether the last attempt actually failed
// (or none has ever succeeded). The status column's isStale check exists to
// age out a poll that has stopped ticking while still mounted; applying that
// same clock here would report a lost link purely because the user has been
// looking at the shortcuts view for a while and nothing has polled since,
// which is a view switch, not an outage.
export function getDeckState() {
  const offline = lastFailed || !lastSnapshot
  return { link: offline ? 'offline' : 'online', battery: batteryFor(offline) }
}

export default {
  id: 'status',
  title: 'État système',

  settings: [
    { key: 'intervalMs', type: 'range', label: 'Intervalle (ms)', default: 10000, min: 2000, max: 60000, step: 1000 },
    { key: 'ip', type: 'bool', label: 'Adresse IP', default: true },
    { key: 'battery', type: 'bool', label: 'Batterie', default: true },
    { key: 'wifi', type: 'bool', label: 'Wi-Fi', default: true },
    // Off by default, alone among the readings that come from the device
    // itself: Android denies an unprivileged app both sources of system CPU
    // load (/proc/stat and /proc/loadavg, refused by SELinux and confirmed on
    // the target device by an audit denial) and offers no public API in their
    // place, so on the hardware this deck runs on the line can only ever read
    // N/A. The setting stays, because the probe does work on a desktop and
    // would work on a rooted phone — what is wrong is offering the reading by
    // default on a device that cannot give it.
    { key: 'cpu', type: 'bool', label: 'Processeur', default: false },
    { key: 'memory', type: 'bool', label: 'Mémoire', default: true },
    { key: 'storage', type: 'bool', label: 'Stockage', default: true },
    { key: 'uptime', type: 'bool', label: 'Temps de fonctionnement', default: false },
    { key: 'link', type: 'bool', label: 'État du lien', default: true },
  ],

  // Everything that varies per mount — the live/dead flag, the timer, the
  // in-flight guard, the abort handle — is a local variable created fresh
  // right here, not module-scope state shared across mounts. That is what
  // makes a stale request from a torn-down mount harmless: it closes over
  // its own `mounted`/`inFlight`, which nothing the next mount does can see
  // or be blocked by. Sharing a single flag across mounts (the more obvious
  // design) would let a fetch a previous mount already abandoned suppress
  // the very first poll of the next one, via a shared `inFlight` that never
  // got the chance to reset — exactly the "two intervals after a remount"
  // defect class this design guards against, one level removed.
  mount(el, ctx) {
    let mounted = true
    let timer = null
    let inFlight = false
    let controller = null

    el.innerHTML = '<pre class="status__lines"></pre>'
      + '<p class="status__verdict"></p>'
      + '<button type="button" class="view-prompt">[ENTRÉE] ACCÉDER AU DECK</button>'
    const linesEl = el.querySelector('.status__lines')
    const verdictEl = el.querySelector('.status__verdict')
    // The prompt is the only element in this view that switches screens —
    // the rest of the body is inert display, on purpose (spec: a click that
    // both did something else and changed screen would be a fault).
    el.querySelector('.view-prompt').addEventListener('click', () => ctx.nextView?.())

    function render() {
      if (!mounted) return
      const settings = ctx.settings
      const now = Date.now()
      const ttlSeconds = (settings.intervalMs * OFFLINE_AFTER) / 1000
      const offline = lastFailed || isStale(lastSnapshot, now, ttlSeconds)
      const rows = []
      for (const key of LINE_KEYS) {
        if (settings[key]) rows.push(formatLine(key, valueFor(key, offline)))
      }
      // Degraded mode marks its age rather than pretending to be current —
      // only meaningful once something has actually been read at least once.
      if (offline && lastSnapshot) {
        const age = ageOf(lastSnapshot, now)
        if (Number.isFinite(age)) rows.push(formatLine('age', `${age}s`))
      }
      linesEl.textContent = rows.join('\n')
      // Built from this view's own `offline`, not from getDeckState(): the
      // two differ deliberately (see getDeckState's comment on isStale), and
      // the verdict sits directly under the LINK line it would otherwise be
      // free to contradict. Whatever that line says, this agrees with it.
      // Every reading the column shows, through the same valueFor() the rows
      // above went through — so the sentence is drawn from the numbers the
      // reader is looking at, not from a second, quieter source that could
      // disagree with them.
      verdictEl.textContent = verdictLine({
        link: offline ? 'offline' : 'online',
        battery: batteryFor(offline),
        cpu: valueFor('cpu', offline),
        memory: valueFor('memory', offline),
        storage: valueFor('storage', offline),
      })
      // cipher.js's journal has no other way to learn that link/battery may
      // have changed — see main.js's own comment on notifyDeckStateChange.
      ctx.notifyDeckStateChange?.()
    }

    async function poll() {
      // Skipping a tick that finds the previous one still in flight is the
      // whole fix for overlap: a ~8s worst case was measured against a
      // 10s default interval, so a hung request bleeding into the next tick
      // is routine, not exceptional. The next tick simply tries again.
      if (!mounted || inFlight) return
      inFlight = true
      controller = new AbortController()
      try {
        const res = await fetch('/api/status', { signal: controller.signal, cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const raw = await res.json()
        const parsed = parseStatus(raw)
        if (parsed.ok) {
          lastSnapshot = parsed
          lastFailed = false
        } else {
          lastFailed = true
        }
      } catch (err) {
        // Network failure, non-200, or a body that didn't parse: all count
        // as "the API did not answer" — lastSnapshot is left untouched, so
        // the last known values keep showing rather than blanking. An abort
        // is none of those (see isRealFailure) and is deliberately excluded.
        if (isRealFailure(err)) lastFailed = true
      } finally {
        inFlight = false
        controller = null
        render()
      }
    }

    function restart(intervalMs) {
      if (timer) clearInterval(timer)
      timer = setInterval(poll, intervalMs)
    }

    // getBattery() is a promise that may be absent, may reject, and settles
    // after the fact — possibly after this very mount has already been torn
    // down. `mounted` is checked again once it resolves for exactly that
    // reason; the `.catch` means a rejection just leaves the browser
    // fallback unavailable rather than becoming an unhandled rejection.
    if (typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function') {
      navigator.getBattery()
        .then((manager) => {
          if (!mounted) return
          batteryManager = manager
          render()
        })
        .catch(() => { /* no browser battery fallback available */ })
    }

    restart(ctx.settings.intervalMs)
    poll()
    render()

    ctx.onSettingsChange((next) => {
      // Safe today only because main.js clears every outgoing module's own
      // listeners (by id) before the next remount, so this callback should
      // never actually fire after teardown() below has run. Checked anyway,
      // defensively, rather than relying on that being the only path here.
      if (!mounted) return
      restart(next.intervalMs)
      render()
    })

    teardown = () => {
      mounted = false
      if (timer) clearInterval(timer)
      controller?.abort()
    }
  },

  unmount() {
    teardown()
    teardown = () => {}
  },
}
