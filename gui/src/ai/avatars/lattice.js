// Transposed from the CIPHER-2 avatar reference mockup, not in this repo
// (the LATTICE card). A node mesh lighting up in cascade (staggered
// `animation-delay` on otherwise-identical pulses), swept by a scanning
// bar — the most "neural network" of the five.
//
// The reference nests the scan bar as a sibling <div> next to the <svg>,
// positioned by the card's own `.stage` (relative + overflow hidden). We own
// no such ancestor here, so `.avatar__stage` reproduces it locally: it is the
// element mount() actually hands back as markup, sized to fill whatever host
// it is given.
const MARKUP = `
<div class="avatar__stage" aria-hidden="true">
  <svg viewBox="0 0 200 200" class="avatar__svg av-lat">
    <g stroke="var(--avatar-ink)" stroke-width="1" opacity=".3">
      <line x1="46" y1="58" x2="100" y2="42"/><line x1="100" y1="42" x2="154" y2="62"/>
      <line x1="46" y1="58" x2="62" y2="110"/><line x1="154" y1="62" x2="142" y2="112"/>
      <line x1="62" y1="110" x2="100" y2="100"/><line x1="142" y1="112" x2="100" y2="100"/>
      <line x1="62" y1="110" x2="74" y2="158"/><line x1="142" y1="112" x2="128" y2="156"/>
      <line x1="74" y1="158" x2="128" y2="156"/><line x1="100" y1="100" x2="100" y2="42"/>
      <line x1="100" y1="100" x2="74" y2="158"/><line x1="100" y1="100" x2="128" y2="156"/>
    </g>
    <g fill="var(--avatar-ink)">
      <circle cx="100" cy="42" r="3" style="animation-delay:0s"/>
      <circle cx="46" cy="58" r="3" style="animation-delay:.45s"/>
      <circle cx="154" cy="62" r="3" style="animation-delay:.9s"/>
      <circle cx="62" cy="110" r="3" style="animation-delay:1.35s"/>
      <circle cx="142" cy="112" r="3" style="animation-delay:1.8s"/>
      <circle cx="100" cy="100" r="4" style="animation-delay:.2s"/>
      <circle cx="74" cy="158" r="3" style="animation-delay:2.25s"/>
      <circle cx="128" cy="156" r="3" style="animation-delay:2.7s"/>
    </g>
  </svg>
  <div class="av-scanbar"></div>
</div>`

let mounted = null

export default {
  id: 'lattice',
  label: 'Lattice — réseau de nœuds',
  kind: 'svg',
  mount(host) { host.innerHTML = MARKUP; mounted = host },
  unmount() { if (mounted) mounted.innerHTML = ''; mounted = null },
}
