// Transposed from the CIPHER-2 avatar reference mockup, not in this repo
// (the IRIS card). A contracting iris with a rotating ring and tick marks,
// plus a static reticle — a presence that looks, without a face.
const MARKUP = `
<svg viewBox="0 0 200 200" class="avatar__svg" aria-hidden="true">
  <g class="av-iris-ring"><circle class="av-s2" cx="100" cy="100" r="74" stroke-dasharray="14 6"/></g>
  <g class="av-iris-tick"><circle class="av-s2" cx="100" cy="100" r="62" stroke-dasharray="1 9"/></g>
  <g class="av-iris-core">
    <circle class="av-s" cx="100" cy="100" r="44"/>
    <circle class="av-s2" cx="100" cy="100" r="32"/>
    <circle class="av-s2" cx="100" cy="100" r="20"/>
    <circle cx="100" cy="100" r="9" fill="var(--avatar-ink)" opacity=".9"/>
  </g>
  <line class="av-s2" x1="100" y1="14" x2="100" y2="34"/><line class="av-s2" x1="100" y1="166" x2="100" y2="186"/>
  <line class="av-s2" x1="14" y1="100" x2="34" y2="100"/><line class="av-s2" x1="166" y1="100" x2="186" y2="100"/>
</svg>`

let mounted = null

export default {
  id: 'iris',
  label: 'Iris — capteur optique',
  kind: 'svg',
  mount(host) { host.innerHTML = MARKUP; mounted = host },
  unmount() { if (mounted) mounted.innerHTML = ''; mounted = null },
}
