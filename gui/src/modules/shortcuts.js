import { LABEL_MAX, ICON_MAX, TARGET_MAX, truncateGraphemes, REFUSED_SCHEMES } from '../core/schema.js'

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const LONG_PRESS_MS = 500
// Chrome Android emits pointermove for sub-pixel jitter under a resting
// finger — cancelling on any movement at all meant a long press would often
// not survive to LONG_PRESS_MS on a real touchscreen, only in a mouse-driven
// test or dev-tools touch emulation. A small slop radius tells real jitter
// apart from an actual drag/scroll.
const LONG_PRESS_SLOP = 10

// The page does not interpret a target beyond refusing the schemes a link has
// no business carrying (REFUSED_SCHEMES, schema.js — the actual boundary,
// since validateShortcut checks it too; this is the editor's own convenience
// pass, not the guarantee). Everything else is handed to Android, which
// decides which application answers.
export function normalizeTarget(raw) {
  if (typeof raw !== 'string') return null
  const value = raw.trim().slice(0, TARGET_MAX)
  if (!value) return null
  if (REFUSED_SCHEMES.test(value)) return null
  if (SCHEME.test(value)) return value
  if (!value.includes('.') || value.includes(' ')) return null
  return `https://${value}`
}

export function moveItem(items, index, delta) {
  const to = index + delta
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return items
  const out = [...items]
  ;[out[index], out[to]] = [out[to], out[index]]
  return out
}

export function createShortcut(fields, newId) {
  const target = normalizeTarget(fields?.target)
  if (!target) return null
  const label = String(fields.label ?? '').slice(0, LABEL_MAX)
  // typeof-gated, not String(fields.icon ?? ''): schema.js's validateShortcut
  // — the boundary every write to the store passes through, including this
  // one's own result — drops a non-string icon to '', never stringifies it.
  // A module more permissive than that boundary is exactly how the shortcut-
  // scheme bug happened (see schema.js's own REFUSED_SCHEMES comment): two
  // paths agreeing by coincidence rather than one of them deferring to the
  // other.
  const icon = truncateGraphemes(typeof fields.icon === 'string' ? fields.icon : '', ICON_MAX)
  return {
    id: newId(),
    label,
    target,
    icon: icon || label.slice(0, 1).toUpperCase(),
    accent: String(fields.accent ?? '').slice(0, 32),
  }
}

// The grid used to be a fixed number of columns of square tiles: with enough
// shortcuts its height simply grew past the band and the column scrolled.
// Squares cannot both keep their shape and be sized by the width alone, so
// the count has to be chosen against both dimensions at once — which is what
// this does. For each possible column count it works out the tile size that
// would result, and keeps whichever count makes the tiles largest.
//
// Pure and exported so the arithmetic is testable without a layout: a wrong
// answer here is a scrollbar or a clipped row, neither of which a unit test
// would otherwise catch until it appeared on the device.
//
// `min` is the touch target (base.css's --tile-min, 44px). When even the best
// arrangement falls under it the tiles are not shrunk further — the function
// returns the widest row that still respects it and reports fits: false, and
// the caller lets the column scroll. A tile too small to hit reliably is
// worse than a scrollbar, which is the one case where scrolling is the right
// answer rather than the bug being fixed here.
export function bestFit({ width, height, gap, count, min, columns = null }) {
  if (!(count > 0) || !(width > 0) || !(height > 0)) return null

  const rowsFor = (cols) => Math.ceil(count / cols)

  // The size a tile would take at this column count: the smaller of what the
  // width allows across and what the height allows down. Taking the smaller
  // is what keeps it square without the height being an afterthought.
  const sizeFor = (cols) => Math.min(
    (width - (cols - 1) * gap) / cols,
    (height - (rowsFor(cols) - 1) * gap) / rowsFor(cols),
  )

  // fits is measured, never assumed. Down the sizeFor path it is always true
  // by construction, but the fallback below picks its size from the width
  // alone and may or may not end up within the height — and the caller turns
  // this flag into a scrollbar, so a guess would put one on screen where none
  // was needed. The epsilon absorbs the sub-pixel division above.
  const result = (cols, size) => {
    const rows = rowsFor(cols)
    return { columns: cols, size, fits: rows * size + (rows - 1) * gap <= height + 0.01 }
  }

  // Nothing fits the height at a usable size, so fill the width properly
  // instead: as many tiles of at least `min` as go across, and let the rows
  // fall where they will. Shrinking below `min` is not on the table — see the
  // comment above.
  const widest = (cap) => {
    const cols = Math.max(1, Math.min(cap, Math.floor((width + gap) / (min + gap))))
    return result(cols, (width - (cols - 1) * gap) / cols)
  }

  // A fixed count from the settings is honoured as given, and only its tile
  // size computed. If the band is too narrow to draw that many legibly it
  // drops to as many as it can — the same "fits what it can" degradation the
  // grid has always had, rather than columns too thin to read.
  if (columns !== null) {
    const cols = Math.max(1, Math.min(columns, count))
    const size = sizeFor(cols)
    return size >= min ? result(cols, size) : widest(cols)
  }

  // Auto: try every count up to one column per tile — more than that is the
  // same single row with empty tracks after it — and keep the largest tile.
  let bestCols = 1
  let bestSize = sizeFor(1)
  for (let cols = 2; cols <= count; cols++) {
    const size = sizeFor(cols)
    if (size > bestSize) {
      bestCols = cols
      bestSize = size
    }
  }
  return bestSize >= min ? result(bestCols, bestSize) : widest(count)
}

// The smallest a tile may be, in rem, resolved to pixels below because
// getPropertyValue hands back the token '3.5rem' rather than a length and
// bestFit needs a number.
//
// 3.5rem (56px), not the 2.75rem (44px) touch target base.css was built
// around. A finger can hit 44px, but the tile cannot draw itself at that
// size: its icon and label bottom out at their own legibility floors
// (clamp(1.1rem, 52cqw, …) and clamp(0.6rem, 20.8cqw, …)), which with the
// 0.35rem gap between them and the tile's 0.5rem padding and 1px border need
// about 54px of tile before they stop spilling out of it. Sizing to 44px
// produced tiles whose contents overflowed them — and, since a grid item's
// overflow reaches its container, a scrolling column, which is the exact
// symptom this whole change exists to remove. The touch target is a floor
// under this one, not the other way round.
const TILE_MIN_REM = 3.5

function tileMinPx() {
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return TILE_MIN_REM * (Number.isFinite(root) ? root : 16)
}

let context = null
let host = null
let resizeObserver = null
let unsubscribeLayout = null

function renderGrid() {
  const items = context.settings.items
  host.replaceChildren()

  if (items.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'shortcuts__empty'
    empty.textContent = 'Aucun raccourci. Ouvrez les réglages pour en ajouter.'
    host.appendChild(empty)
  } else {
    const grid = document.createElement('div')
    grid.className = 'shortcuts__grid'

    for (const item of items) {
      const tile = document.createElement('a')
      tile.className = 'tile'
      tile.href = item.target
      tile.dataset.id = item.id
      if (item.accent) tile.style.setProperty('--accent', item.accent)
      tile.innerHTML = '<span class="tile__icon"></span><span class="tile__label"></span>'
      tile.querySelector('.tile__icon').textContent = item.icon
      tile.querySelector('.tile__label').textContent = item.label
      attachLongPress(tile, item)
      grid.appendChild(tile)
    }

    host.appendChild(grid)
  }

  // The only element in this view that switches screens — see status.js's
  // own matching prompt: the prompt alone is clickable, so a tap on a tile
  // must only ever launch that tile, never also leave this view.
  const prompt = document.createElement('button')
  prompt.type = 'button'
  prompt.className = 'view-prompt'
  prompt.textContent = '[ÉCHAP] RETOUR'
  prompt.addEventListener('click', () => context?.resetView?.())
  host.appendChild(prompt)

  // Last, after the prompt: the grid is flex: 1 of this column, so appending
  // anything below it takes height away from it. Measuring before the prompt
  // existed sized the tiles against a box that was about to shrink, and three
  // rows then overflowed by exactly the prompt's height.
  observeGrid()
}

// The grid is rebuilt by every render, so the observation has to follow it.
// Watching the grid rather than the host covers both causes of a changed box
// with one subscription: the band resizing (the grid is flex: 1, so it
// resizes with it) and anything below the grid changing height, which the
// host would never report because the host itself does not move.
function observeGrid() {
  resizeObserver?.disconnect()
  const grid = host?.querySelector('.shortcuts__grid')
  if (!grid) return
  applyFit()
  if (typeof ResizeObserver !== 'function') return
  resizeObserver = new ResizeObserver(() => applyFit())
  resizeObserver.observe(grid)
}

// Writes bestFit's answer onto the grid as two custom properties, which
// base.css's track sizing reads. Explicit pixel tracks rather than 1fr with
// aspect-ratio: 1, because a square sized off the width alone is exactly what
// used to overflow the band's height — the whole point is that this size was
// chosen against both dimensions.
function applyFit() {
  const grid = host?.querySelector('.shortcuts__grid')
  if (!grid) return
  const setting = context?.getLayout?.().columns ?? 'auto'
  const fit = bestFit({
    width: grid.clientWidth,
    height: grid.clientHeight,
    gap: parseFloat(getComputedStyle(grid).rowGap) || 0,
    count: grid.childElementCount,
    min: tileMinPx(),
    columns: setting === 'auto' ? null : Number(setting),
  })
  // Null means the grid has not been laid out yet (a zero box, as during a
  // mount into a hidden band). The CSS fallback holds until the
  // ResizeObserver fires with real numbers, which it does as soon as it has
  // any — leaving the last good values in place would be worse, since they
  // would describe a different box.
  if (!fit) return
  grid.style.setProperty('--grid-cols', String(fit.columns))
  grid.style.setProperty('--tile-size', `${fit.size}px`)
  // Only the case bestFit could not satisfy scrolls. Everything else is sized
  // to fit, so the band shows no scrollbar at all — which is the bug this
  // exists to fix, and the attribute is what makes the distinction visible to
  // CSS rather than implied by the numbers.
  grid.dataset.overflowing = String(!fit.fits)
}

// A long press opens the editor; the click that would follow is swallowed so
// the shortcut does not fire on the way out.
function attachLongPress(tile, item) {
  let timer = null
  let fired = false
  let startX = 0
  let startY = 0

  const cancel = () => { clearTimeout(timer); timer = null }

  tile.addEventListener('pointerdown', (event) => {
    fired = false
    startX = event?.clientX ?? 0
    startY = event?.clientY ?? 0
    timer = setTimeout(() => {
      fired = true
      context?.openEditor?.(item.id)
    }, LONG_PRESS_MS)
  })
  tile.addEventListener('pointerup', cancel)
  tile.addEventListener('pointercancel', cancel)
  // Only a move past the slop radius cancels — see LONG_PRESS_SLOP.
  tile.addEventListener('pointermove', (event) => {
    const dx = (event?.clientX ?? startX) - startX
    const dy = (event?.clientY ?? startY) - startY
    if (Math.hypot(dx, dy) > LONG_PRESS_SLOP) cancel()
  })
  tile.addEventListener('click', (event) => {
    if (fired) event.preventDefault()
  })
  // base.css's -webkit-touch-callout: none on .tile is not reliably honoured
  // on Chrome Android: a long press on an <a href> can still raise the
  // browser's own context menu on top of (or instead of) the editor this
  // long press is meant to open.
  tile.addEventListener('contextmenu', (event) => event.preventDefault())
}

export default {
  id: 'shortcuts',
  title: 'Raccourcis',
  settings: [],

  settingsView(el, { store, moveItem: move, createShortcut: create, rerender }) {
    // Every handler below reads the list fresh from the store and locates its
    // own row by id, never by an array or index captured once when this
    // function ran: a sibling row's edit, or any reorder/delete/add in the
    // same panel session, makes both stale before the handler fires — and an
    // index survives a reorder even less than the array does.
    const currentItems = () => store.get().modules.shortcuts.items
    const write = (next) => { store.set('modules.shortcuts.items', next); rerender() }

    el.replaceChildren()
    const list = document.createElement('ul')
    list.className = 'editor'

    currentItems().forEach((item) => {
      const { id } = item
      const row = document.createElement('li')
      row.className = 'editor__row'
      // maxlength is only a coarse guard against pasting a paragraph in: the
      // authoritative limit is ICON_MAX graphemes, enforced on write by
      // truncateGraphemes. A flag emoji alone is 4 UTF-16 units, so anything
      // tighter would truncate mid-emoji — three flags (12 units) or a ZWJ
      // family sequence both clear this attribute easily and still get cut
      // to size correctly by the grapheme-aware truncation.
      row.innerHTML = '<div class="editor__head">'
        + '<input class="editor__icon" maxlength="16" aria-label="Icône">'
        + '<input class="editor__label" maxlength="32" placeholder="Nom">'
        + '<button type="button" class="editor__up" aria-label="Monter">↑</button>'
        + '<button type="button" class="editor__down" aria-label="Descendre">↓</button>'
        + '<button type="button" class="editor__del" aria-label="Supprimer">✕</button>'
        + '</div>'
        + '<input class="editor__target" placeholder="URL, spotify:, intent://" aria-label="Cible">'

      const icon = row.querySelector('.editor__icon')
      const label = row.querySelector('.editor__label')
      const target = row.querySelector('.editor__target')
      icon.value = item.icon
      label.value = item.label
      target.value = item.target
      target.dataset.edit = id

      const patch = () => {
        const fresh = currentItems()
        const at = fresh.findIndex((x) => x.id === id)
        if (at === -1) return // this row was deleted elsewhere in the meantime
        // Mirrors validateShortcut's own target check (schema.js): an empty or
        // scheme-refused target is not edited by the schema boundary, it is
        // dropped — the whole shortcut disappears from the array. Committing
        // that here would delete the row out from under the user for nothing
        // worse than an accidental select-all-delete; refuse the write instead
        // and put the field back to what is actually stored, so the editor
        // never lingers showing values the store no longer has.
        const nextTarget = target.value.slice(0, TARGET_MAX).trim()
        if (!nextTarget || REFUSED_SCHEMES.test(nextTarget)) {
          target.value = fresh[at].target
          return
        }
        const next = [...fresh]
        next[at] = { ...next[at], icon: icon.value, label: label.value, target: target.value }
        store.set('modules.shortcuts.items', next)
      }
      for (const input of [icon, label, target]) input.addEventListener('change', patch)

      row.querySelector('.editor__up').addEventListener('click', () => {
        const fresh = currentItems()
        write(move(fresh, fresh.findIndex((x) => x.id === id), -1))
      })
      row.querySelector('.editor__down').addEventListener('click', () => {
        const fresh = currentItems()
        write(move(fresh, fresh.findIndex((x) => x.id === id), 1))
      })
      row.querySelector('.editor__del').addEventListener('click', () => {
        write(currentItems().filter((x) => x.id !== id))
      })

      list.appendChild(row)
    })

    el.appendChild(list)

    const add = document.createElement('button')
    add.type = 'button'
    add.className = 'editor__add'
    add.textContent = '+ Ajouter un raccourci'
    add.addEventListener('click', () => {
      const created = create(
        { label: 'Nouveau', target: 'https://example.com', icon: '' },
        () => crypto.randomUUID(),
      )
      write([...currentItems(), created])
    })
    el.appendChild(add)
  },

  mount(el, ctx) {
    context = ctx
    host = el
    renderGrid()
    ctx.onSettingsChange(renderGrid)
    // layout.columns lives outside this module's own settings, so
    // onSettingsChange never hears about it — see main.js's layoutListeners.
    // Changing it resizes nothing on its own, so the observer above would not
    // fire either: without this the setting would appear to do nothing until
    // something else happened to redraw.
    unsubscribeLayout = ctx.onLayoutChange?.(applyFit) ?? null
  },

  unmount() {
    resizeObserver?.disconnect()
    resizeObserver = null
    unsubscribeLayout?.()
    unsubscribeLayout = null
    context = null
    host = null
  },
}
