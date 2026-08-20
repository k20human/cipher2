// Transposed from the CIPHER-2 avatar reference mockup, not in this repo
// (register('cv-nexus', …)): 440 points on a Fibonacci sphere, projected in
// perspective, spinning on two axes. Two adaptations from the reference:
// angles derive from a per-effect frame counter instead of `now`, so the
// render is deterministic; colour comes from `colors.avatarInk`, never a literal.
import { createEngine } from '../../ambient/engine.js'
import { avatarAmbientConfig } from './shared.js'

const N = 440

function makePoints() {
  return Array.from({ length: N }, (_, i) => {
    const y = 1 - (i / (N - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const th = i * Math.PI * (3 - Math.sqrt(5))
    return [Math.cos(th) * r, y, Math.sin(th) * r]
  })
}

export function effect() {
  const pts = makePoints()
  let frame = 0
  return {
    resize() {},
    step(ctx, w, h, cfg, colors) {
      frame += 1
      ctx.clearRect(0, 0, w, h)
      // 280 and 600, not the reference's 140 and 300: at the deck's 30 fps cap
      // those gave a turn every 29 and 63 seconds, which read as busy next to
      // a status column you are trying to read. Halved, it is a drift rather
      // than a spin — about a minute and two minutes a revolution.
      const a = frame / 280, b = frame / 600
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b)
      ctx.fillStyle = (colors.avatarInk ?? colors.fg)
      for (const [x0, y0, z0] of pts) {
        const x1 = x0 * ca - z0 * sa, z1 = x0 * sa + z0 * ca
        const y1 = y0 * cb - z1 * sb, z2 = y0 * sb + z1 * cb
        const p = 1.6 / (2.2 - z2)
        ctx.globalAlpha = 0.18 + (z2 + 1) * 0.41
        ctx.fillRect(cx + x1 * R * p, cy + y1 * R * p, 1.6, 1.6)
      }
      ctx.globalAlpha = 1
    },
  }
}

let engine = null
let observer = null

export default {
  id: 'nexus',
  label: 'Nexus — sphère de particules',
  kind: 'canvas',
  effect,
  mount(host, ctx) {
    // Guards a second mount() called without an intervening unmount(): without
    // this, the previous engine's rAF loop would keep running forever, drawing
    // into a detached canvas, with no reference left to stop it.
    engine?.stop()
    observer?.disconnect()
    host.innerHTML = '<canvas class="avatar__canvas"></canvas>'
    const canvas = host.querySelector('canvas')
    const eng = createEngine({
      canvas,
      effect: effect(),
      // Not ctx.getAmbient directly: this avatar must keep animating even
      // when "Fond animé" is off — see shared.js.
      getConfig: avatarAmbientConfig(ctx),
      getColors: ctx.getColors,
      win: { get innerWidth() { return host.clientWidth }, get innerHeight() { return host.clientHeight } },
    })
    engine = eng
    eng.start()
    // engine.js only re-measures from start()/setConfig(), and nothing calls
    // either when the host itself changes size later, or measures zero at
    // mount time because it isn't laid out yet. Watching the host directly
    // — rather than changing engine.js — keeps this avatar-specific: the
    // full-screen ambient engine already gets its own resize listener, in
    // main.js.
    observer = new ResizeObserver(() => eng.resize())
    observer.observe(host)
  },
  unmount() {
    observer?.disconnect()
    observer = null
    engine?.stop()
    engine = null
  },
}
