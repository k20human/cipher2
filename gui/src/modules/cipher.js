import { AVATARS, AVATAR_IDS, avatarById } from '../ai/registry.js'
import { bootLines, stateLines } from '../core/journal.js'

let current = null
let host = null
let context = null
let unsubscribeDeckState = null

function mountAvatar(id) {
  current?.unmount()
  current = null
  const slot = host?.querySelector('.cipher__avatar')
  if (!slot) return
  const avatar = avatarById(id) ?? avatarById(AVATAR_IDS[0])
  slot.replaceChildren()
  avatar.mount(slot, context)
  current = avatar
}

// Exported so the "what should the journal say" decision is testable without
// mounting any DOM. Pure but for the two calls into ctx (settings.log,
// getDeckState()) — foreign code this module does not control (main.js
// today, live telemetry tomorrow) — which is exactly why this is
// wrapped: stateLines already guards a hostile *state*, but ctx.getDeckState
// itself throwing, or ctx.settings itself being a throwing getter, would
// reach neither that guard nor the tests written for it. Degrading to an empty
// journal on any such failure keeps this from aborting main.js's
// settings-change listener loop mid-iteration for every module after this
// one, the same failure mode journal.js's own comment describes.
export function journalLines(ctx) {
  try {
    return ctx.settings.log
      ? [...bootLines(), ...stateLines(ctx.getDeckState?.() ?? {})]
      : []
  } catch {
    return []
  }
}

function renderJournal() {
  const slot = host?.querySelector('.cipher__log')
  if (!slot) return
  slot.textContent = journalLines(context).join('\n')
}

export default {
  id: 'cipher',
  title: 'CIPHER-2',
  // Read by core/registry.js's containerFor: the left band is this module's
  // home, declared here rather than in a separately-maintained list in
  // main.js. A module with no `band` field mounts right, the deck's default.
  band: 'left',

  settings: [
    {
      key: 'avatar',
      type: 'select',
      label: 'Avatar',
      default: 'vortex',
      options: AVATARS.map((a) => ({ value: a.id, label: a.label })),
    },
    { key: 'log', type: 'bool', label: 'Journal', default: true },
  ],

  mount(el, ctx) {
    host = el
    context = ctx
    el.innerHTML = '<div class="cipher__avatar"></div><pre class="cipher__log"></pre>'
    mountAvatar(ctx.settings.avatar)
    renderJournal()
    ctx.onSettingsChange((next) => {
      if (next.avatar !== current?.id) mountAvatar(next.avatar)
      renderJournal()
    })
    // Telemetry (status.js) updates outside the settings store, on
    // its own poll — this is the only way the journal ever learns a link
    // outage recovered, or a low battery report changed, without waiting
    // for an unrelated cipher setting to also change first.
    unsubscribeDeckState = ctx.onDeckStateChange?.(renderJournal) ?? null
  },

  unmount() {
    current?.unmount()
    current = null
    host = null
    context = null
    unsubscribeDeckState?.()
    unsubscribeDeckState = null
  },
}
