import { LOGO_STYLES } from '../core/schema.js'

// The text is written twice: once as textContent for the visible glyphs, once
// as a data attribute so CSS pseudo-elements can duplicate it for the glitch
// and major treatments. Never as markup.
export function renderLogo(host, style, text) {
  const chosen = LOGO_STYLES.includes(style) ? style : LOGO_STYLES[0]
  host.className = `logo logo--${chosen}`
  host.dataset.text = text
  host.textContent = text
}
