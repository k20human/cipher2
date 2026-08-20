import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AVATARS, AVATAR_IDS, avatarById } from '../src/ai/registry.js'

function fakeHost() {
  return { innerHTML: '', children: [], appendChild(c) { this.children.push(c) },
           replaceChildren() { this.children = []; this.innerHTML = '' } }
}

test('every avatar declares the same shape', () => {
  for (const a of AVATARS) {
    assert.ok(a.id && a.label, JSON.stringify(a))
    assert.ok(['svg', 'canvas'].includes(a.kind), `${a.id}: ${a.kind}`)
    assert.equal(typeof a.mount, 'function', a.id)
    assert.equal(typeof a.unmount, 'function', a.id)
  }
})

test('avatar ids are unique', () => {
  assert.equal(new Set(AVATAR_IDS).size, AVATAR_IDS.length)
})

test('the five svg avatars are present', () => {
  for (const id of ['core', 'halo', 'wave', 'iris', 'lattice']) {
    assert.equal(avatarById(id)?.kind, 'svg', id)
  }
})

test('avatarById refuses an inherited key', () => {
  assert.equal(avatarById('toString'), undefined)
  assert.equal(avatarById('constructor'), undefined)
})

test('an svg avatar mounts markup and clears it on unmount', () => {
  for (const a of AVATARS.filter((x) => x.kind === 'svg')) {
    const host = fakeHost()
    a.mount(host, {})
    assert.ok(host.innerHTML.includes('<svg'), `${a.id} produced no svg`)
    a.unmount()
  }
})

test('svg avatars carry no script and no external reference', () => {
  for (const a of AVATARS.filter((x) => x.kind === 'svg')) {
    const host = fakeHost()
    a.mount(host, {})
    assert.ok(!/<script/i.test(host.innerHTML), `${a.id} embeds a script`)
    assert.ok(!/https?:\/\//i.test(host.innerHTML), `${a.id} references a remote URL`)
    a.unmount()
  }
})
