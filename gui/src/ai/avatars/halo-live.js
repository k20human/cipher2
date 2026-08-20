// An animated counterpart to halo.js, offered alongside it rather than
// replacing it: the original's motion is deliberate and slow — its rings turn
// once every 13 to 34 seconds — which reads as still on any glance shorter
// than that. Measured over 1.7s it changed 1.25% of its pixels, and most of
// that was the background rain showing through, not the avatar.
//
// Same geometry, same palette variables. What differs is the tempo and two
// additions the original has no equivalent for: a radar sweep, and pings that
// expand out of the core. Everything animates transform, opacity or
// stroke-dashoffset only, so this stays a compositor job rather than a
// per-frame redraw, and every animated element is a descendant of the root —
// which is what puts them all under avatars.css's reduced-motion rule.
const MARKUP = `
<svg viewBox="0 0 200 200" class="avatar__svg av-halo av-halo-glow" aria-hidden="true">
  <g class="avl-ping"><circle class="av-s2" cx="100" cy="100" r="46"/></g>
  <g class="avl-ping avl-ping--b"><circle class="av-s2" cx="100" cy="100" r="46"/></g>

  <g class="avl-spin-a"><circle class="av-s av-grain" cx="100" cy="100" r="78"/></g>
  <g class="avl-spin-b"><circle class="av-s av-grain2" cx="100" cy="100" r="70"/></g>
  <g class="avl-spin-a"><circle class="av-s2 av-grain" cx="100" cy="100" r="62"/></g>
  <g class="avl-spin-c">
    <path class="av-s" d="M100 46 A54 54 0 0 1 154 100" stroke-dasharray="1 4"/>
    <path class="av-s" d="M100 154 A54 54 0 0 1 46 100" stroke-dasharray="1 4"/>
  </g>

  <circle class="av-s2 avl-trace" cx="100" cy="100" r="86" stroke-dasharray="12 22"/>
  <g class="avl-sweep"><line class="av-s2" x1="100" y1="100" x2="100" y2="20"/></g>

  <g class="avl-core">
    <circle class="av-s2" cx="100" cy="100" r="30"/>
    <ellipse class="av-s2" cx="100" cy="100" rx="30" ry="11"/>
    <ellipse class="av-s2" cx="100" cy="100" rx="30" ry="22"/>
    <ellipse class="av-s2" cx="100" cy="100" rx="11" ry="30"/>
    <ellipse class="av-s2" cx="100" cy="100" rx="22" ry="30"/>
  </g>
</svg>`

let mounted = null

export default {
  id: 'halo-live',
  label: 'Halo — animé',
  kind: 'svg',
  mount(host) { host.innerHTML = MARKUP; mounted = host },
  unmount() { if (mounted) mounted.innerHTML = ''; mounted = null },
}
