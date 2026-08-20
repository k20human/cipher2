import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderLogo } from '../src/modules/logo.js'
import { LOGO_STYLES } from '../src/core/schema.js'

function fakeHost() {
  const el = { className: '', children: [], textContent: '',
               dataset: {}, replaceChildren(...c) { this.children = c } }
  return el
}

test('every declared style renders without throwing', () => {
  for (const style of LOGO_STYLES) {
    const host = fakeHost()
    renderLogo(host, style, 'CIPHER-2')
    assert.match(host.className, new RegExp(`logo--${style}`), style)
  }
})

test('an unknown style falls back to the first declared one', () => {
  const host = fakeHost()
  renderLogo(host, 'nope', 'CIPHER-2')
  assert.match(host.className, new RegExp(`logo--${LOGO_STYLES[0]}`))
})

test('the logo text is carried as data, never as markup', () => {
  const host = fakeHost()
  renderLogo(host, 'glitch', '<script>alert(1)</script>')
  assert.equal(host.dataset.text, '<script>alert(1)</script>')
  assert.equal(host.textContent, '<script>alert(1)</script>')
})
