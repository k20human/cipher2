// Transposed from the CIPHER-2 avatar reference mockup, not in this repo
// (the HALO card). The "particles" are short dashes on counter-rotating
// circles, not individual animated elements — same visual read as the Jarvis
// reference, at zero per-frame cost. `av-core-wrap` is the same
// breathing group CORE's card uses in the reference (there named
// `core-wrap`); it is defined once in avatars.css and reused here for the
// small central sphere.
const MARKUP = `
<svg viewBox="0 0 200 200" class="avatar__svg av-halo av-halo-glow" aria-hidden="true">
  <g class="av-halo-a"><circle class="av-s av-grain" cx="100" cy="100" r="78"/></g>
  <g class="av-halo-b"><circle class="av-s av-grain2" cx="100" cy="100" r="70"/></g>
  <g class="av-halo-a"><circle class="av-s2 av-grain" cx="100" cy="100" r="62"/></g>
  <g class="av-halo-c">
    <path class="av-s" d="M100 46 A54 54 0 0 1 154 100" stroke-dasharray="1 4"/>
    <path class="av-s" d="M100 154 A54 54 0 0 1 46 100" stroke-dasharray="1 4"/>
  </g>
  <g class="av-core-wrap">
    <circle class="av-s2" cx="100" cy="100" r="30"/>
    <ellipse class="av-s2" cx="100" cy="100" rx="30" ry="11"/>
    <ellipse class="av-s2" cx="100" cy="100" rx="30" ry="22"/>
    <ellipse class="av-s2" cx="100" cy="100" rx="11" ry="30"/>
    <ellipse class="av-s2" cx="100" cy="100" rx="22" ry="30"/>
  </g>
</svg>`

let mounted = null

export default {
  id: 'halo',
  label: 'Halo — d’après Jarvis, sans canvas',
  kind: 'svg',
  mount(host) { host.innerHTML = MARKUP; mounted = host },
  unmount() { if (mounted) mounted.innerHTML = ''; mounted = null },
}
