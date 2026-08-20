import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const GUI_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SERVED = new Set(['.js', '.css', '.html', '.json', '.png'])
const SKIPPED = new Set(['test', 'tools', 'node_modules'])

// Recurses into every directory it finds — src/ai/, src/ai/avatars/, or
// whatever the next task adds — rather than a hand-kept list of directories.
// The strict cache-first worker (sw.js) means a file missing from ASSETS
// still works while the dev server is up and fails silently the moment it
// is not: this walk is what stands between a new subdirectory and that gap.
async function walk(dir, base = '') {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIPPED.has(entry.name)) continue
    const rel = `${base}/${entry.name}`
    if (entry.isDirectory()) out.push(...await walk(path.join(dir, entry.name), rel))
    else if (SERVED.has(path.extname(entry.name))) out.push(rel)
  }
  return out
}

async function precachedAssets() {
  const source = await readFile(path.join(GUI_ROOT, 'sw.js'), 'utf8')
  const block = source.match(/const ASSETS = \[([\s\S]*?)\]/)
  assert.ok(block, 'sw.js has no ASSETS array')
  return new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
}

test('every served file is precached', async () => {
  const onDisk = await walk(GUI_ROOT)
  const cached = await precachedAssets()
  // sw.js serves itself and must never be cached; index.html is cached.
  const missing = onDisk.filter((f) => f !== '/sw.js' && !cached.has(f))
  assert.deepEqual(missing, [], `not in sw.js ASSETS: ${missing.join(', ')}`)
})

test('every precached path exists on disk', async () => {
  const onDisk = new Set(await walk(GUI_ROOT))
  const cached = await precachedAssets()
  const ghosts = [...cached].filter((f) => !onDisk.has(f))
  assert.deepEqual(ghosts, [], `listed in sw.js but absent: ${ghosts.join(', ')}`)
})

test('the cache version is a bumpable literal', async () => {
  const source = await readFile(path.join(GUI_ROOT, 'sw.js'), 'utf8')
  assert.match(source, /const CACHE_VERSION = 'cipher2-v\d+'/)
})
