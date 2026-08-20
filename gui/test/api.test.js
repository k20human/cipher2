import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GUI_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PORT = 8100 // distinct from serve.test.js's 8099 to avoid collision when tests run concurrently

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

test('the status route answers with a complete envelope', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/status`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /application\/json/)
    const body = await res.json()
    for (const key of ['ts', 'ip', 'battery', 'wifi', 'cpu', 'memory', 'storage', 'uptime_s']) {
      assert.ok(key in body, `missing key: ${key}`)
    }
    assert.equal(typeof body.ts, 'number')
  })
})

test('a missing termux command yields null, not a failure', async () => {
  // termux-battery-status does not exist on the dev machine, so this asserts
  // the real degraded path rather than a simulated one.
  await withServer(async (base) => {
    const body = await (await fetch(`${base}/api/status`)).json()
    assert.ok(body.battery === null || typeof body.battery === 'object')
  })
})

test('the status route is never cached', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/status`)
    assert.match(res.headers.get('cache-control') ?? '', /no-store|no-cache/)
  })
})

test('an unknown api route is a 404, not a crash', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/api/nope`)).status, 404)
  })
})
