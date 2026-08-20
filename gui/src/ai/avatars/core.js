// Transposed from the CIPHER-2 avatar reference mockup, not in this repo
// (the CORE card). Markup and animation classes carried over as-is; only the
// class names gained an `av-` prefix so they cannot collide with the panel,
// the tiles or the logo, which share this stylesheet's namespace.
//
// The reference's root <svg class="core-wrap"> also breathes (scale + opacity,
// `av-breathe`), on top of the two counter-rotations. That class cannot sit on
// the root here: the reduced-motion rule in avatars.css is `.avatar__svg *`,
// a descendant combinator, so a class on the very element that also carries
// `avatar__svg` would never be matched and would keep animating under
// prefers-reduced-motion. halo.js already solved this the right way for its
// own reuse of `av-core-wrap` — nest it as a <g> *inside* the root instead of
// on it — so the existing selector reaches it with no CSS change. Same fix
// here: one extra wrapping <g>, root left exactly as it was.
const MARKUP = `
<svg viewBox="0 0 200 200" class="avatar__svg" aria-hidden="true">
  <g class="av-core-wrap">
    <g class="av-core">
      <circle class="av-s" cx="100" cy="100" r="62"/>
      <ellipse class="av-s2" cx="100" cy="100" rx="62" ry="20"/>
      <ellipse class="av-s2" cx="100" cy="100" rx="62" ry="40"/>
      <ellipse class="av-s2" cx="100" cy="100" rx="20" ry="62"/>
      <ellipse class="av-s2" cx="100" cy="100" rx="40" ry="62"/>
    </g>
    <g class="av-core-in">
      <polygon class="av-s" points="100,62 133,81 133,119 100,138 67,119 67,81"/>
      <polygon class="av-s2" points="100,72 124,86 124,114 100,128 76,114 76,86"/>
      <circle class="av-s" cx="100" cy="100" r="5"/>
    </g>
    <circle class="av-s2" cx="100" cy="100" r="76" stroke-dasharray="2 6"/>
  </g>
</svg>`

let mounted = null

export default {
  id: 'core',
  label: 'Core — noyau géométrique',
  kind: 'svg',
  mount(host) { host.innerHTML = MARKUP; mounted = host },
  unmount() { if (mounted) mounted.innerHTML = ''; mounted = null },
}
