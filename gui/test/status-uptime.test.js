import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// tools/status.py is Python, so these run it the way api.test.js does — by
// spawning the interpreter — rather than reimplementing its logic here. The
// import path is derived from this file rather than from the working
// directory: the suite is run from the repository root, where 'tools' does
// not resolve.
const TOOLS = fileURLToPath(new URL('../tools', import.meta.url))
const py = (code) => execFileSync('python3', ['-c', code], { encoding: 'utf8' }).trim()
const PRELUDE = `import sys, os, time; sys.path.insert(0, ${JSON.stringify(TOOLS)}); import status; `

test('the stat parse survives an executable name containing spaces and brackets', () => {
  // Field 2 of /proc/PID/stat is the executable name in parentheses, and it
  // may hold both spaces and parentheses — the one thing that makes a naive
  // whitespace split read the wrong field. Splitting on the last ')' is what
  // this asserts, with a name built to break anything else.
  const line = '1234 (mon (drole) de nom) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 987654 20 21'
  const out = py(`${PRELUDE}print(status.boot_offset_from(${JSON.stringify(line)}, 100))`)
  assert.equal(out, '9876.54')
})

test('uptime answers, and the derived path agrees with the direct one', () => {
  const out = py(`${PRELUDE}
direct = int(float(open('/proc/uptime').read().split()[0]))
with open('/proc/self/stat') as fh:
    derived = int(status.boot_offset_from(fh.read(), os.sysconf('SC_CLK_TCK')) + (time.monotonic() - status._STARTED))
print(direct, derived, status.uptime())`)
  const [direct, derived, reported] = out.split(/\s+/).map(Number)
  assert.ok(direct > 0, 'no direct reading to compare against')
  // Two seconds of slack: the derived value carries the resolution of the
  // clock-tick counter, and the two are not read at the same instant.
  assert.ok(Math.abs(direct - derived) <= 2, `direct ${direct} vs derived ${derived}`)
  assert.ok(Math.abs(direct - reported) <= 2, `direct ${direct} vs uptime() ${reported}`)
})

// The reason the derived path exists at all. On the target device SELinux
// grants an unprivileged app /proc/meminfo and denies it /proc/uptime, so the
// direct read raises and the fallback has to carry the answer alone.
test('uptime still answers when the direct source is unreadable', () => {
  const out = py(`${PRELUDE}
import builtins
real = builtins.open
def refuse(path, *a, **k):
    if str(path) == '/proc/uptime':
        raise PermissionError(13, 'Permission denied')
    return real(path, *a, **k)
builtins.open = refuse
print(status.uptime())`)
  const value = Number(out)
  assert.ok(Number.isInteger(value) && value > 0, `expected a positive integer, got ${out}`)
})
