const MIN_FPS = 10
const MAX_FPS = 60

// The canvas is sized in CSS pixels times resolutionScale, never times
// devicePixelRatio. At ratio 2.6 the native buffer would be 2.53 Mpx per
// frame, which the Adreno 610 cannot repaint at any useful rate.
export function canvasSize(cssW, cssH, scale) {
  return {
    width: Math.max(1, Math.round(cssW * scale)),
    height: Math.max(1, Math.round(cssH * scale)),
  }
}

export function frameInterval(fpsCap) {
  const fps = Math.min(MAX_FPS, Math.max(MIN_FPS, Number.isFinite(fpsCap) ? fpsCap : 30))
  return 1000 / fps
}

export function createEngine({
  canvas,
  effect,
  getConfig,
  getColors,
  raf = globalThis.requestAnimationFrame,
  caf = globalThis.cancelAnimationFrame,
  now = () => performance.now(),
  doc = globalThis.document,
  win = globalThis.window,
}) {
  const ctx = canvas.getContext('2d')
  let handle = null
  let last = 0
  let running = false

  const engine = {
    frameCount: 0,

    resize() {
      const cfg = getConfig()
      const { width, height } = canvasSize(win.innerWidth, win.innerHeight, cfg.resolutionScale)
      canvas.width = width
      canvas.height = height
      effect.resize(width, height, cfg)
    },

    start() {
      if (running) return
      running = true
      doc.addEventListener('visibilitychange', onVisibility)
      engine.resize()
      schedule()
    },

    stop() {
      running = false
      doc.removeEventListener('visibilitychange', onVisibility)
      cancel()
    },

    setConfig() {
      if (!running) return
      cancel()
      engine.resize()
      schedule()
    },
  }

  function paintBackground() {
    if (!ctx) return
    ctx.fillStyle = getColors().bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  function schedule() {
    if (!running || doc.hidden || !getConfig().enabled) {
      // A disabled or hidden ambient still owes one clean background: the
      // canvas must never show the previous effect frozen mid-frame.
      paintBackground()
      return
    }
    last = now()
    handle = raf(tick)
  }

  function cancel() {
    if (handle !== null) caf(handle)
    handle = null
  }

  function tick() {
    if (!running) return
    const cfg = getConfig()
    if (!cfg.enabled) {
      // Re-checked every frame: enabled can flip mid-flight with nobody
      // calling setConfig(), so the loop must be able to stop itself.
      handle = null
      paintBackground()
      return
    }
    const t = now()
    if (t - last >= frameInterval(cfg.fpsCap)) {
      last = t
      engine.frameCount += 1
      if (ctx) effect.step(ctx, canvas.width, canvas.height, cfg, getColors())
    }
    handle = raf(tick)
  }

  function onVisibility() {
    if (doc.hidden) cancel()
    else schedule()
  }

  return engine
}
