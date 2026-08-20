export const GLYPHS = {
  // Half-width katakana: the Matrix alphabet, and every glyph is one cell wide.
  katakana: 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ',
  hex: '0123456789ABCDEF',
  ascii: '!"#$%&()*+,-./:;<=>?@[]^_{|}~abcdefghijklmnopqrstuvwxyz',
}

const CELL = 16
const MIN_SPEED = 2
const MAX_SPEED = 14

// The separation between the rain and the interface's text is carried by
// colors.rain (theme.js), a shifted, darker shade of the palette's own fg —
// not by this alpha, which only softens the glyph edges so they stop
// competing for attention with the lines in front of them. Hence 0.85 and not
// the 0.55 it took when transparency was doing the whole job on its own.
// fg is the fallback for a caller that predates the palette entry.
const GLYPH_ALPHA = 0.85

export function columnCount(width, density, cellWidth) {
  const cells = Math.max(1, Math.floor(Math.max(0, width) / cellWidth))
  const d = Math.min(1, Math.max(0.05, Number.isFinite(density) ? density : 0.5))
  return Math.max(1, Math.round(cells * d))
}

export function createRain() {
  let columns = []
  let cell = CELL

  function seed(count, height, spread) {
    columns = Array.from({ length: count }, (_, i) => ({
      x: Math.round((i + 0.5) * spread),
      y: -Math.floor(rand() * height),
      speed: MIN_SPEED + rand() * (MAX_SPEED - MIN_SPEED),
    }))
  }

  // Deterministic enough for an ambient effect and free of Math.random's
  // reputation for surprising a test suite.
  let seedState = 0x2f6e2b1
  function rand() {
    seedState ^= seedState << 13
    seedState ^= seedState >>> 17
    seedState ^= seedState << 5
    return ((seedState >>> 0) % 100000) / 100000
  }

  return {
    resize(width, height, cfg) {
      const count = columnCount(width, cfg.density, CELL)
      cell = CELL
      seed(count, height, width / count)
    },

    step(ctx, width, height, cfg, colors) {
      // The trail is a translucent wash of the background, not per-glyph
      // bookkeeping: one fillRect replaces thousands of erase operations.
      ctx.globalAlpha = 0.06 + (1 - cfg.trail) * 0.34
      ctx.fillStyle = colors.bg
      ctx.fillRect(0, 0, width, height)
      ctx.globalAlpha = 1

      const alphabet = GLYPHS[cfg.glyphs] ?? GLYPHS.katakana
      ctx.font = `${cell}px ui-monospace, monospace`
      ctx.textBaseline = 'top'
      ctx.fillStyle = colors.rain ?? colors.fg
      ctx.globalAlpha = GLYPH_ALPHA

      for (const col of columns) {
        const ch = alphabet[Math.floor(rand() * alphabet.length)]
        ctx.fillText(ch, col.x, col.y)
        col.y += col.speed * (0.3 + cfg.speed)
        if (col.y > height) {
          col.y = -cell * Math.floor(rand() * 20)
          col.speed = MIN_SPEED + rand() * (MAX_SPEED - MIN_SPEED)
        }
      }

      // The context is the engine's, not this scene's, and createEngine hands
      // the same one to whichever scene runs next — leaving it at GLYPH_ALPHA
      // would tint an avatar that never asked to be tinted.
      ctx.globalAlpha = 1
    },
  }
}
