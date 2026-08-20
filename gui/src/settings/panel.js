import { CORE_SECTIONS } from './core-settings.js'
import { moveItem, createShortcut } from '../modules/shortcuts.js'
import { renderSystemSection } from './transfer.js'

export function collectSections(coreSections, moduleDefs, order) {
  return [
    ...coreSections,
    ...moduleDefs.map((def) => ({
      id: `module:${def.id}`,
      title: def.title,
      path: `modules.${def.id}`,
      moduleId: def.id,
      enabled: order.includes(def.id),
      settings: def.settings,
      view: def.settingsView,
    })),
  ]
}

// Re-enabling restores a module to its canonical position. Appending would
// silently demote it below every module still switched on — which is how the
// clock ended up under the shortcuts.
export function toggleModule(order, id, enabled, allIds) {
  if (!allIds.includes(id)) return order
  const present = order.includes(id)
  if (enabled === present) return order
  if (!enabled) return order.filter((x) => x !== id)
  const next = new Set([...order, id])
  return allIds.filter((candidate) => next.has(candidate))
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function renderControl(decl, value, onChange) {
  const row = el('label', 'field')
  row.appendChild(el('span', 'field__label', decl.label))

  let input
  if (decl.type === 'bool') {
    input = el('input', 'field__input')
    input.type = 'checkbox'
    input.checked = Boolean(value)
    input.addEventListener('change', () => onChange(input.checked))
  } else if (decl.type === 'range') {
    row.classList.add('field--range')
    input = el('input', 'field__input')
    input.type = 'range'
    input.min = decl.min
    input.max = decl.max
    input.step = decl.step ?? 1
    input.value = value ?? decl.min
    const readout = el('span', 'field__value', String(value ?? '—'))
    // 'input' fires continuously while dragging; 'change' fires once, on
    // release. Only the readout tracks 'input' — store.set() runs on
    // 'change' alone, since every write is a clone + validate + freeze +
    // stringify + synchronous localStorage.setItem (store.js), and for an
    // ambient slider a full rain reseed (rain.js's resize()) besides. Doing
    // that on every 'input' tick made a drag feel gritty on the reference
    // device's Adreno 610, and visibly reset the rain mid-gesture.
    input.addEventListener('input', () => {
      readout.textContent = String(Number(input.value))
    })
    input.addEventListener('change', () => {
      onChange(Number(input.value))
    })
    row.appendChild(readout)
  } else if (decl.type === 'select') {
    input = el('select', 'field__input')
    for (const opt of decl.options) {
      const option = el('option', null, opt.label)
      option.value = opt.value
      input.appendChild(option)
    }
    input.value = value
    input.addEventListener('change', () => onChange(input.value))
  } else {
    input = el('input', 'field__input')
    input.type = decl.type === 'color' ? 'color' : 'text'
    input.value = value ?? ''
    input.addEventListener('change', () => onChange(input.value))
  }

  row.appendChild(input)

  // A nullable range needs a way back to "no override".
  if (decl.nullable) {
    const clear = el('button', 'field__clear', 'auto')
    clear.type = 'button'
    clear.addEventListener('click', () => onChange(null))
    row.appendChild(clear)
  }

  return row
}

export function createPanel({ store, registry, root = document.body }) {
  const overlay = el('div', 'panel')
  overlay.hidden = true
  overlay.innerHTML = '<div class="panel__sheet"><header class="panel__head">'
    + '<h2>RÉGLAGES</h2><button type="button" class="panel__close">✕</button>'
    + '</header><div class="panel__body"></div></div>'
  const body = overlay.querySelector('.panel__body')
  overlay.querySelector('.panel__close').addEventListener('click', () => api.close())
  overlay.addEventListener('click', (e) => { if (e.target === overlay) api.close() })
  root.appendChild(overlay)

  function valueAt(path, key) {
    return path.split('.').reduce((node, part) => node[part], store.get())[key]
  }

  function render() {
    const config = store.get()
    const sections = collectSections(CORE_SECTIONS, registry.all(), config.layout.order)
    body.replaceChildren()

    for (const section of sections) {
      const box = el('section', 'panel__section')
      const head = el('h3', 'panel__title', section.title)
      box.appendChild(head)

      if (section.moduleId) {
        const toggle = renderControl(
          { key: '__enabled', type: 'bool', label: 'Activé' },
          section.enabled,
          // Read the order at click time, not at render time: an earlier
          // toggle in this same panel may already have changed it.
          (on) => store.set('layout.order',
            toggleModule(store.get().layout.order, section.moduleId, on, registry.ids())),
        )
        box.appendChild(toggle)
      }

      for (const decl of section.settings) {
        box.appendChild(renderControl(
          decl,
          valueAt(section.path, decl.key),
          (value) => store.set(`${section.path}.${decl.key}`, value),
        ))
      }

      if (section.view) {
        const host = el('div', 'panel__custom')
        box.appendChild(host)
        section.view(host, { store, moveItem, createShortcut, rerender: render })
      }

      body.appendChild(box)
    }

    const systemSection = renderSystemSection({ store, rerender: render })
    body.appendChild(systemSection)
    return systemSection
  }

  const api = {
    get isOpen() { return !overlay.hidden },
    open() { render(); overlay.hidden = false },
    close() { overlay.hidden = true },
    openShortcutEditor(id) {
      api.open()
      // CSS.escape: id is store-supplied (a shortcut's own id, imaginable from
      // an imported config), not a literal this file controls. Interpolated
      // raw into the attribute selector, a `"` in it breaks out of the
      // selector's string and throws — CSS.escape is what keeps an arbitrary
      // id safe to embed here.
      const target = overlay.querySelector(`[data-edit="${CSS.escape(id)}"]`)
      target?.scrollIntoView({ block: 'center' })
      target?.focus()
    },
  }

  return api
}
