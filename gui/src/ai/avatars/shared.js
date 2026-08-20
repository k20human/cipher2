// Shared by nexus.js, vortex.js and cipher-core.js: the getConfig each one
// hands to createEngine(). All three read the same `ambient` slice ctx.getAmbient()
// exposes — the slice that also drives the background rain — because density,
// speed, trail, glyphs, resolutionScale and fpsCap are meaningful for a canvas
// avatar too and there is no separate per-avatar copy of them (a known gap:
// independently adjustable caps for the two canvases are not built here).
//
// `enabled` is the one field that must NOT come along for the ride: it is the
// "Fond animé" switch, and an avatar is not the ambient background. engine.js
// re-reads `enabled` every frame and, when it is false, stops rescheduling
// itself without ever calling setConfig() again — main.js only revives the
// *background* engine when ambient changes, so an avatar engine left reading
// the real `enabled` would go dark the moment the background is switched off
// and never come back until the avatar itself is remounted. Forcing `true`
// here decouples the two: the switch still silences the rain, and now only
// the rain.
export function avatarAmbientConfig(ctx) {
  return () => ({ ...ctx.getAmbient(), enabled: true })
}
