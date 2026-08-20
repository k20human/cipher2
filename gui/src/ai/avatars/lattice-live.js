// An animated counterpart to lattice.js, offered alongside it. The original
// pulses its nodes and sweeps a bar across; over 1.7s that moved 0.54% of the
// frame, the least of the three. The graph is identical — same twelve edges,
// same eight nodes — but here the edges carry the motion rather than merely
// connecting things that move.
//
// Each edge is dashed and its dash pattern slides along it, which reads as a
// signal running from node to node: the line itself never moves, only the
// pattern painted on it, so twelve travelling signals cost twelve
// stroke-dashoffset interpolations and no geometry work at all. The nodes
// keep their staggered pulse, faster, and each edge starts at its own offset
// so the graph never fires in unison.
//
// animation-delay is set inline per element for the same reason lattice.js
// already does it: eight nodes and twelve edges would otherwise need twenty
// near-identical CSS rules whose only difference is a number.
const MARKUP = `
<div class="avatar__stage" aria-hidden="true">
  <svg viewBox="0 0 200 200" class="avatar__svg av-lat">
    <g class="avl-edges" stroke="var(--avatar-ink)" stroke-width="1" stroke-dasharray="5 11">
      <line x1="46" y1="58" x2="100" y2="42" style="animation-delay:0s"/>
      <line x1="100" y1="42" x2="154" y2="62" style="animation-delay:-.4s"/>
      <line x1="46" y1="58" x2="62" y2="110" style="animation-delay:-.8s"/>
      <line x1="154" y1="62" x2="142" y2="112" style="animation-delay:-1.2s"/>
      <line x1="62" y1="110" x2="100" y2="100" style="animation-delay:-1.6s"/>
      <line x1="142" y1="112" x2="100" y2="100" style="animation-delay:-2s"/>
      <line x1="62" y1="110" x2="74" y2="158" style="animation-delay:-2.4s"/>
      <line x1="142" y1="112" x2="128" y2="156" style="animation-delay:-2.8s"/>
      <line x1="74" y1="158" x2="128" y2="156" style="animation-delay:-3.2s"/>
      <line x1="100" y1="100" x2="100" y2="42" style="animation-delay:-3.6s"/>
      <line x1="100" y1="100" x2="74" y2="158" style="animation-delay:-1s"/>
      <line x1="100" y1="100" x2="128" y2="156" style="animation-delay:-2.2s"/>
    </g>
    <g class="avl-nodes" fill="var(--avatar-ink)">
      <circle cx="100" cy="42" r="3" style="animation-delay:0s"/>
      <circle cx="46" cy="58" r="3" style="animation-delay:.2s"/>
      <circle cx="154" cy="62" r="3" style="animation-delay:.4s"/>
      <circle cx="62" cy="110" r="3" style="animation-delay:.6s"/>
      <circle cx="142" cy="112" r="3" style="animation-delay:.8s"/>
      <circle cx="100" cy="100" r="4" style="animation-delay:.1s"/>
      <circle cx="74" cy="158" r="3" style="animation-delay:1s"/>
      <circle cx="128" cy="156" r="3" style="animation-delay:1.2s"/>
    </g>
    <g class="avl-hub"><circle class="av-s2" cx="100" cy="100" r="26"/></g>
  </svg>
  <div class="av-scanbar avl-scanbar"></div>
</div>`

let mounted = null

export default {
  id: 'lattice-live',
  label: 'Lattice — animé',
  kind: 'svg',
  mount(host) { host.innerHTML = MARKUP; mounted = host },
  unmount() { if (mounted) mounted.innerHTML = ''; mounted = null },
}
