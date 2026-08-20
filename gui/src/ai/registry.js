import core from './avatars/core.js'
import halo from './avatars/halo.js'
import wave from './avatars/wave.js'
import iris from './avatars/iris.js'
import lattice from './avatars/lattice.js'
import nexus from './avatars/nexus.js'
import vortex from './avatars/vortex.js'
import cipherCore from './avatars/cipher-core.js'
import haloLive from './avatars/halo-live.js'
import waveLive from './avatars/wave-live.js'
import latticeLive from './avatars/lattice-live.js'
import nexusPulse from './avatars/nexus-pulse.js'

// Each "live" variant sits next to the one it is a counterpart of rather than
// at the end of the list: the panel renders this order, and the choice being
// offered is between two tempos of the same avatar, not between eleven
// unrelated ones.
export const AVATARS = [
  core,
  halo, haloLive,
  wave, waveLive,
  iris,
  lattice, latticeLive,
  nexus, nexusPulse,
  vortex, cipherCore,
]

const index = new Map(AVATARS.map((a) => [a.id, a]))

export const AVATAR_IDS = AVATARS.map((a) => a.id)

// A Map lookup, not a plain object: an object would resolve inherited keys
// such as 'toString', the same defect class already fixed twice in this repo.
export function avatarById(id) {
  return index.get(id)
}
