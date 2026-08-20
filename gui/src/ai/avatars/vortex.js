// Transposed from the CIPHER-2 avatar reference mockup, not in this repo
// (register('cv-vortex', …)): a turbulent particle ring plus a wire core.
// Same adaptations as nexus.js: a per-effect frame counter stands in for
// `now`, a local xorshift generator (rain.js's algorithm, its own seed)
// stands in for Math.random, and colour comes from `colors.avatarInk`, falling back to `colors.accent` — the
// reference itself renders this avatar in cyan, never a literal.
import { createEngine } from '../../ambient/engine.js'
import { avatarAmbientConfig } from './shared.js'

const N = 620

// The seed is drawn once, at effect() creation, so it needs its own
// generator rather than a shared module-level one: two mounted instances of
// the same avatar (mount/unmount/mount) must not perturb each other's stream.
function makeRand(seed) {
  let state = seed
  return function rand() {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 100000) / 100000
  }
}

function makeSeed() {
  const rand = makeRand(0x7c3a91e5)
  return Array.from({ length: N }, (_, i) => ({
    a: (i / N) * Math.PI * 2,
    o: rand() * Math.PI * 2,
    sp: 0.6 + rand() * 0.9,
  }))
}

export function effect() {
  const seed = makeSeed()
  let frame = 0
  return {
    resize() {},
    step(ctx, w, h, cfg, colors) {
      frame += 1
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.34
      const t = frame / 30
      ctx.fillStyle = (colors.avatarInk ?? colors.accent)
      for (const p of seed) {
        const wob = Math.sin(t * p.sp + p.o) * 0.13 + Math.sin(t * 0.4 + p.a * 3) * 0.07
        const rr = R * (1 + wob)
        const ang = p.a + t * 0.12
        ctx.globalAlpha = 0.25 + Math.abs(Math.sin(t * p.sp + p.o)) * 0.6
        ctx.fillRect(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, 1.5, 1.5)
      }
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = (colors.avatarInk ?? colors.accent)
      ctx.lineWidth = 1
      const r2 = R * 0.42
      ctx.beginPath(); ctx.arc(cx, cy, r2, 0, Math.PI * 2); ctx.stroke()
      for (let i = 1; i <= 3; i++) {
        const ry = r2 * Math.cos((i / 4) * Math.PI)
        ctx.beginPath(); ctx.ellipse(cx, cy, r2, Math.abs(ry), 0, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.globalAlpha = 1
    },
  }
}

let engine = null
let observer = null

export default {
  id: 'vortex',
  label: 'Vortex — anneau turbulent',
  kind: 'canvas',
  effect,
  mount(host, ctx) {
    // Same guard as nexus.js: stop any engine (and observer) a previous
    // mount() left running before this one replaces it.
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
    // Same reasoning as nexus.js: engine.js never re-measures on its own
    // after start(), so the host's own size changes (or an initially
    // zero-sized host being laid out later) need this observer to reach it.
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
