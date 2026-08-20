// The livelier counterpart to wave.js, offered alongside it. Same motion in
// kind — vertical only, swelling and contracting about the centre line, no
// sideways drift — and the difference is how hard it is driven: a wider
// amplitude range, a deeper bob, faster, and the two traces in counterphase
// so the pair is never twice in the same shape.
//
// The level bars under the frame blink on their own staggered delays. They
// are the one thing here that is not the trace, and they stay because they
// read as a meter rather than as motion across the frame.
//
// Geometry, nesting and the clipPath follow wave.js exactly — see its comment
// for why the path is anchored to the frame and why the clip is the frame
// rectangle rather than an overflow rule. The clipPath id differs from that
// file's so the two can never collide if both are ever in the document.
const MARKUP = `
<svg viewBox="0 0 200 200" class="avatar__svg av-wave" aria-hidden="true">
  <defs>
    <clipPath id="avl-wave-clip"><rect x="10" y="52" width="180" height="96"/></clipPath>
  </defs>
  <line class="av-s2" x1="10" y1="100" x2="190" y2="100" stroke-dasharray="2 5"/>

  <g clip-path="url(#avl-wave-clip)">
    <g class="avl-bob"><g class="avl-swell">
      <path class="av-s" d="M10 100 q9 -34 18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0"/>
    </g></g>
    <g class="avl-bob avl-bob--b"><g class="avl-swell avl-swell--b">
      <path class="av-s2" d="M10 100 q9 22 18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0"/>
    </g></g>
  </g>

  <rect class="av-s2" x="10" y="52" width="180" height="96" stroke-dasharray="3 4"/>

  <g class="avl-bars" fill="var(--avatar-ink)">
    <rect x="18" y="160" width="4" height="8" style="animation-delay:0s"/>
    <rect x="30" y="160" width="4" height="8" style="animation-delay:.18s"/>
    <rect x="42" y="160" width="4" height="8" style="animation-delay:.36s"/>
    <rect x="54" y="160" width="4" height="8" style="animation-delay:.54s"/>
    <rect x="66" y="160" width="4" height="8" style="animation-delay:.72s"/>
    <rect x="78" y="160" width="4" height="8" style="animation-delay:.9s"/>
    <rect x="90" y="160" width="4" height="8" style="animation-delay:1.08s"/>
    <rect x="102" y="160" width="4" height="8" style="animation-delay:1.26s"/>
    <rect x="114" y="160" width="4" height="8" style="animation-delay:1.44s"/>
    <rect x="126" y="160" width="4" height="8" style="animation-delay:1.62s"/>
    <rect x="138" y="160" width="4" height="8" style="animation-delay:1.8s"/>
    <rect x="150" y="160" width="4" height="8" style="animation-delay:1.98s"/>
  </g>
</svg>`

let mounted = null

export default {
  id: 'wave-live',
  label: 'Wave — animé',
  kind: 'svg',
  mount(host) { host.innerHTML = MARKUP; mounted = host },
  unmount() { if (mounted) mounted.innerHTML = ''; mounted = null },
}
