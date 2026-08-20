// Frozen so a stray write throws instead of silently corrupting every
// caller's view of the theme — these objects are shared, never copies.
export const THEMES = {
  matrix: Object.freeze({
    bg: '#000000', fg: '#00ff41', accent: '#00ff41', dim: '#0a3d16', glow: '#00ff41',
  }),
  nightcity: Object.freeze({
    bg: '#05060a', fg: '#fcee0a', accent: '#00f0ff', dim: '#1b1d2b', glow: '#fcee0a',
  }),
  arasaka: Object.freeze({
    bg: '#070203', fg: '#ff003c', accent: '#ff003c', dim: '#33060f', glow: '#ff003c',
  }),
}

// The background keeps its own hue: rotating a near-black is invisible, and
// tinting it would only muddy the contrast the palette relies on.
const ROTATED = ['fg', 'accent', 'dim', 'glow']

// The rain used to draw in fg, the same colour as every readable line, so the
// glyphs falling behind the status column read as part of it. It gets its own
// entry now: a step round the wheel and a darker tone, which is a different
// shade of the palette's own colour rather than a second colour competing
// with it.
//
// Derived rather than three literals in THEMES, for two reasons. One, the
// arithmetic is the same in every palette, so writing it out per theme is
// three chances to get it wrong and a fourth every time a theme is added.
// Two, it is derived from the *rotated* fg, below, so the shift survives the
// Teinte slider: rotation collapses every ROTATED key onto the one hue the
// user picked, and a rain literal in that list would come out at exactly the
// text's hue, losing the distinction this exists to draw.
const RAIN_HUE_SHIFT = 14
const RAIN_LIGHTNESS = 0.7

export function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: h * 360, s, l }
}

export function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] = hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
      : hp < 3 ? [0, c, x]
        : hp < 4 ? [0, x, c]
          : hp < 5 ? [x, 0, c]
            : [c, 0, x]
  const m = l - c / 2
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r1)}${to(g1)}${to(b1)}`
}

export function resolveTheme(name, hue) {
  // Own-property check: THEMES[name] would also resolve inherited
  // Object.prototype keys such as 'toString' or 'constructor'.
  const base = Object.hasOwn(THEMES, name) ? THEMES[name] : THEMES.matrix
  // Always hand back a fresh object — base is a frozen, shared THEMES entry,
  // and every caller must own what it receives, rotated or not.
  const out = { ...base }
  if (hue !== null && hue !== undefined) {
    for (const key of ROTATED) {
      const { s, l } = hexToHsl(base[key])
      out[key] = hslToHex(hue, s, l)
    }
  }
  const fg = hexToHsl(out.fg)
  out.rain = hslToHex(fg.h + RAIN_HUE_SHIFT, fg.s, fg.l * RAIN_LIGHTNESS)
  return out
}

export function applyTheme(root, vars) {
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(`--${key}`, value)
  }
}
