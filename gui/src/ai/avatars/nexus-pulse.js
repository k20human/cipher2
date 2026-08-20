// nexus.js with one addition and nothing else: the sphere breathes. Same 440
// points on the same Fibonacci lattice, same two-axis spin, same perspective
// projection and the same per-frame alpha — only the radius now swells and
// contracts on a slow cycle.
//
// Deliberately a separate file rather than a flag on nexus.js. The two are
// offered side by side in the panel, so both have to exist at once, and a
// shared module reading a parameter would put a branch in the hot loop for a
// value that never changes within a mount. The duplication is the projection
// maths, twelve lines of it; the alternative was a parameterised effect whose
// only caller passes a constant.
import { createEngine } from '../../ambient/engine.js'
import { avatarAmbientConfig } from './shared.js'

const N = 440

// One full breath every 660 frames — about 22 seconds at the deck's 30 fps
// cap. Slow enough to read as breathing rather than pulsing, which is what was
// asked for, and never the thing your eye is drawn to while reading the status
// column beside it.
const PERIOD = 660

// The radius swings between these two multiples of the base. The upper bound
// is 1, not more: nexus.js's 0.36 was chosen against the band, and letting the
// sphere grow past it would put points outside the box on the wide side of
// every breath. So the breath is taken out of the radius rather than added to
// it — the sphere contracts from its full size and returns, and its largest
// state is exactly the one nexus.js already draws.
//
// 0.45, not the 0.72 this started at. Depth is the lever, not speed: a 28%
// swing spread over half a minute changes the radius by a fraction of a
// percent per second, which is below what the eye picks up on a sphere of
// scattered dots — the breath was there and invisible. Better than half the
// diameter is unmistakable, and it keeps the cycle slow.
const MIN_SCALE = 0.45
const MAX_SCALE = 1

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
      const a = frame / 280, b = frame / 600
      // A cosine, not a triangle wave: it eases at both ends on its own, so
      // the sphere settles at full size and at its smallest instead of
      // reversing on a corner.
      const breath = (1 - Math.cos((frame / PERIOD) * Math.PI * 2)) / 2
      const scale = MAX_SCALE - (MAX_SCALE - MIN_SCALE) * breath
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36 * scale
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
  id: 'nexus-pulse',
  label: 'Nexus — sphère respirante',
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
    // mount time because it isn't laid out yet.
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
