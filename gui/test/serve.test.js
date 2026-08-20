import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const GUI_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PORT = 8099

// Starts serve.py, waits for its ready line, runs fn, then always kills it.
async function withServer(fn) {
  const proc = spawn('python3', ['tools/serve.py', String(PORT)], {
    cwd: GUI_ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start')), 5000)
      proc.stdout.on('data', (chunk) => {
        if (String(chunk).includes('serving')) {
          clearTimeout(timer)
          resolve()
        }
      })
      proc.on('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`server exited with ${code}`))
      })
    })
    await fn(`http://127.0.0.1:${PORT}`)
  } finally {
    proc.kill('SIGTERM')
  }
}

test('serves the manifest as application/json', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/manifest.json`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /application\/json/)
    const manifest = await res.json()
    // fullscreen, not standalone: standalone still leaves the status bar and
    // the navigation bar in place, and this is an ambience screen. The value
    // degrades on its own where a launcher will not honour it — the
    // fallback chain runs fullscreen, standalone, minimal-ui, browser.
    assert.equal(manifest.display, 'fullscreen')
    assert.ok(manifest.icons.length >= 2)
  })
})

test('serves modules as text/javascript', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/src/main.js`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /text\/javascript/)
  })
})

test('never lets the service worker be cached', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/sw.js`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('cache-control') ?? '', /no-cache/)
  })
})

test('never serves a file from above the gui root', async () => {
  // A real file that lives one level above the served root: the one
  // guarantee this test pins is that its content never comes back through
  // the server, however the request path is spelled.
  const secret = readFileSync(join(GUI_ROOT, '..', '.gitignore'), 'utf8')
  assert.ok(secret.length > 0, 'fixture is empty, this test would prove nothing')

  await withServer(async (base) => {
    // Control: prove the comparison below actually discriminates, by
    // checking it against a body we do serve and know differs from secret.
    const served = await fetch(`${base}/manifest.json`)
    assert.notEqual(await served.text(), secret)

    // Some of these are normalised away by the URL parser before the
    // request leaves (fetch never sends the traversal); the rest reach
    // serve.py still encoded, and it's translate_path()'s unquote+normpath
    // that collapses them. Either way, none may ever yield the secret.
    const traversals = [
      '/../.gitignore',
      '/%2e%2e/.gitignore',
      '/..%2f.gitignore',
      '/%2e%2e%2f%2e%2e%2f.gitignore',
    ]
    for (const traversal of traversals) {
      const res = await fetch(`${base}${traversal}`)
      const body = await res.text()
      assert.notEqual(res.status, 200)
      assert.ok(!body.includes(secret), `${traversal} leaked the parent .gitignore (status ${res.status})`)
    }
  })
})
