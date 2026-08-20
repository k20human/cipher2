// Transposed from the CIPHER-2 avatar reference mockup, not in this repo
// (register('cv-rain', …)): the Matrix rain, clipped to a disc, with a
// dashed tick ring. Unlike nexus/vortex this effect never read `now` in the
// reference either — its motion is purely per-step increments — so only two
// of the three mandated adaptations apply here: a local xorshift generator
// (rain.js's algorithm, its own seed) replaces Math.random, and colour comes
// from `colors.bg`/`colors.avatarInk`, never the reference's literal rgba strings.
import { createEngine } from '../../ambient/engine.js'
import { avatarAmbientConfig } from './shared.js'

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ'
const CELL = 11

function makeRand(seed) {
  let state = seed
  return function rand() {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 100000) / 100000
  }
}

export function effect() {
  const rand = makeRand(0x1a2ffe33)
  let cols = []

  return {
    resize(w, h) {
      const n = Math.max(4, Math.floor(w / CELL))
      cols = Array.from({ length: n }, (_, i) => ({
        x: i * CELL + CELL / 2,
        // Seeded across the canvas rather than entirely above it. These
        // columns fall at 1.2-2.6 px a frame and the disc's top edge sits
        // well below y=0, so a purely negative seed left the core visibly
        // empty for the first several seconds after every mount — measured
        // at 1920x1080: blank at 1s, populated at 6s. A quarter of the span
        // still starts above the top so the stream keeps a lead-in instead
        // of beginning on a hard edge.
        y: (rand() * 1.25 - 0.25) * h,
        v: 1.2 + rand() * 2.6,
      }))
    },
    step(ctx, w, h, cfg, colors) {
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42

      // The disc clip confines the whole rain (wash + glyphs) to a circle;
      // the ring below is stroked after restore(), outside the clip.
      ctx.save()
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip()
      ctx.globalAlpha = 0.22
      ctx.fillStyle = colors.bg
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1
      ctx.font = `${CELL}px ui-monospace, monospace`
      ctx.textBaseline = 'top'
      ctx.fillStyle = (colors.avatarInk ?? colors.fg)
      for (const c of cols) {
        ctx.fillText(GLYPHS[Math.floor(rand() * GLYPHS.length)], c.x - CELL / 2, c.y)
        c.y += c.v
        if (c.y > h) c.y = -CELL * Math.floor(rand() * 12)
      }
      ctx.restore()

      ctx.globalAlpha = 0.45
      ctx.strokeStyle = (colors.avatarInk ?? colors.fg)
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([2, 7])
      ctx.beginPath(); ctx.arc(cx, cy, R + 7, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    },
  }
}

let engine = null
let observer = null

export default {
  id: 'cipher-core',
  label: 'Cipher Core — pluie de code confinée',
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
