// Transposed from the CIPHER-2 avatar reference mockup, not in this repo
// (the WAVE card), and since amended: the reference scrolls its waveform
// sideways, which is not what this deck wanted. The trace now moves
// vertically instead — it swells and contracts about its own centre line, and
// rides gently up and down — and stays put horizontally.
//
// Dropping the drift let the path be re-anchored to the frame it is drawn in.
// It used to run from x=-160 to x=200, 160 units of slack past the viewBox, so
// that a fresh copy of the pattern was always ready to scroll into view. With
// nothing scrolling, that surplus was geometry drawn only to be clipped. Ten
// arches of 18 units now span x=10 to x=190 exactly — five whole periods
// between the frame's own edges, ending where the frame ends rather than
// mid-arch.
//
// Two nested groups, because one element cannot carry two transforms: the
// outer one bobs, the inner one swells. Both are declared in avatars.css,
// which is also where the amplitude budget is worked out against the frame.
//
// The clipPath is that budget's guarantee rather than its substitute, and it
// is the frame rectangle itself (10,52 to 190,148): whatever the amplitude
// does, nothing is ever drawn outside the box — a promise the arithmetic
// alone could only keep until somebody changed a number. Note it must be a
// clipPath and not `overflow: hidden`, which clips at the element's box: the
// two only coincide while that box is square, and the avatar slot is a 2:1
// letterbox (825x371, measured in the band).
const MARKUP = `
<svg viewBox="0 0 200 200" class="avatar__svg av-wave" aria-hidden="true">
  <defs>
    <clipPath id="av-wave-clip"><rect x="10" y="52" width="180" height="96"/></clipPath>
  </defs>
  <line class="av-s2" x1="10" y1="100" x2="190" y2="100" stroke-dasharray="2 5"/>

  <g clip-path="url(#av-wave-clip)">
    <g class="av-wave-bob"><g class="av-wave-swell">
      <path class="av-s" d="M10 100 q9 -34 18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0"/>
      <path class="av-s2" d="M10 100 q9 22 18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0"/>
    </g></g>
  </g>

  <rect class="av-s2" x="10" y="52" width="180" height="96" stroke-dasharray="3 4"/>
</svg>`

let mounted = null

export default {
  id: 'wave',
  label: 'Wave — oscilloscope',
  kind: 'svg',
  mount(host) { host.innerHTML = MARKUP; mounted = host },
  unmount() { if (mounted) mounted.innerHTML = ''; mounted = null },
}
