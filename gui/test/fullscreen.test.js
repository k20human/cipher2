import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldOfferFullscreen, setupFullscreen } from '../src/core/fullscreen.js'

test('the button is offered only when it has something to do', () => {
  const base = { supported: true, displayMode: 'browser', fullscreenElement: null }
  assert.equal(shouldOfferFullscreen(base), true)

  // Already full screen through the API: the button would do nothing.
  assert.equal(shouldOfferFullscreen({ ...base, fullscreenElement: {} }), false)

  // Already full screen through the manifest. This is the case that needs
  // both checks: an installed app launched full screen never called the API,
  // so fullscreenElement is null and testing it alone would offer the button
  // to someone whose screen is already bare.
  assert.equal(shouldOfferFullscreen({ ...base, displayMode: 'fullscreen' }), false)

  // No API at all — an offer that cannot be honoured is worse than none.
  assert.equal(shouldOfferFullscreen({ ...base, supported: false }), false)
})

function fakeEnv({ supported = true, matches = false } = {}) {
  const listeners = {}
  const on = (t, fn) => { (listeners[t] ??= []).push(fn) }
  const off = (t, fn) => { listeners[t] = (listeners[t] ?? []).filter((f) => f !== fn) }
  const calls = []
  const query = { matches, addEventListener: on, removeEventListener: off }
  const doc = {
    fullscreenElement: null,
    documentElement: supported ? { requestFullscreen: () => { calls.push('request'); return Promise.resolve() } } : {},
    addEventListener: on,
    removeEventListener: off,
  }
  const win = { matchMedia: () => query }
  const button = {
    hidden: false,
    addEventListener: on,
    removeEventListener: off,
    click: () => (listeners.click ?? []).forEach((f) => f()),
  }
  return { doc, win, button, query, calls, fire: (t) => (listeners[t] ?? []).forEach((f) => f()) }
}

test('setup hides the button when the app already launched full screen', () => {
  const env = fakeEnv({ matches: true })
  setupFullscreen(env.button, env.doc, env.win)
  assert.equal(env.button.hidden, true)
})

test('a click asks for full screen, and the button then hides itself', () => {
  const env = fakeEnv()
  setupFullscreen(env.button, env.doc, env.win)
  assert.equal(env.button.hidden, false)
  env.button.click()
  assert.deepEqual(env.calls, ['request'])
  // The browser reports the change through an event, not a return value.
  env.doc.fullscreenElement = {}
  env.fire('fullscreenchange')
  assert.equal(env.button.hidden, true)
})

test('setup is inert where the API is missing, and tolerates no button', () => {
  const env = fakeEnv({ supported: false })
  setupFullscreen(env.button, env.doc, env.win)
  assert.equal(env.button.hidden, true)
  assert.doesNotThrow(() => setupFullscreen(null))
})
