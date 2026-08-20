import { BUILD } from '../core/build.js'
const pad = (n) => String(n).padStart(2, '0')

export function buildExportFilename(date) {
  return `cyberdeck-config-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`
}

// The clipboard is the primary route and the download the secondary one: a
// standalone PWA can have its downloads swallowed by the system, whereas
// writeText works from any user gesture.
export function renderSystemSection({ store, doc = document, clipboard = navigator.clipboard, rerender }) {
  const section = doc.createElement('section')
  section.className = 'panel__section'
  // The storage warning is a standing environmental fact, not an action
  // result, so it gets its own node built once from the current
  // store.persistent — never say()/sayAfterRerender, which only ever carry
  // transient results and would otherwise erase it the next time either
  // runs. render() rebuilds this section on every open and after every
  // successful import/reset, so the warning is re-evaluated fresh each
  // time instead of going stale.
  const warning = store.persistent
    ? ''
    : '<p class="system__warning" role="status">Stockage local indisponible : les réglages seront perdus à la fermeture.</p>'
  section.innerHTML = '<h3 class="panel__title">Système</h3>'
    + warning
    // The build the page is running, not the one on disk — see build.js.
    + `<p class="system__build">Version chargée : <b>${BUILD}</b></p>`
    + '<div class="system__row">'
    + '<button type="button" class="system__copy">Copier la configuration</button>'
    + '<button type="button" class="system__download">Télécharger</button>'
    + '</div>'
    + '<textarea class="system__paste" rows="4" placeholder="Coller une configuration JSON ici"></textarea>'
    + '<div class="system__row">'
    + '<button type="button" class="system__import">Importer</button>'
    + '<button type="button" class="system__reset">Réinitialiser</button>'
    + '</div>'
    + '<p class="system__status" role="status"></p>'

  const status = section.querySelector('.system__status')
  const paste = section.querySelector('.system__paste')
  const say = (message, ok = true) => {
    status.textContent = message
    status.dataset.ok = String(ok)
  }

  // Import and reset both rebuild the whole panel on success, so every
  // other section (theme, shortcuts...) picks up the restored values
  // instead of showing stale ones — see render() in panel.js. That
  // replaces this very section, `status` node included, so the
  // confirmation message has to land on the section rerender() just
  // built, not on the one nobody can see any more. Falling back to this
  // section when no rerender is supplied keeps the message visible even
  // without one (e.g. a caller that doesn't need the rest of the panel
  // refreshed).
  const doRerender = rerender ?? (() => section)
  const sayAfterRerender = (message) => {
    const fresh = doRerender()
    const node = fresh.querySelector('.system__status')
    node.textContent = message
    node.dataset.ok = 'true'
  }

  section.querySelector('.system__copy').addEventListener('click', async () => {
    try {
      await clipboard.writeText(store.toJSON())
      say('Configuration copiée dans le presse-papier.')
    } catch (err) {
      say(`Copie impossible (${err.name}). Utilisez « Télécharger ».`, false)
    }
  })

  section.querySelector('.system__download').addEventListener('click', () => {
    const blob = new Blob([store.toJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = doc.createElement('a')
    link.href = url
    link.download = buildExportFilename(new Date())
    link.click()
    // Revoking synchronously right after click() is a known source of
    // downloads that silently never start: some browsers still need the
    // blob URL once the click handler returns. Deferring the revoke to the
    // next macrotask lets the download start first.
    setTimeout(() => URL.revokeObjectURL(url), 0)
    say('Téléchargement lancé.')
  })

  section.querySelector('.system__import').addEventListener('click', () => {
    const result = store.fromJSON(paste.value)
    if (result.ok) {
      paste.value = ''
      sayAfterRerender('Configuration importée.')
    } else {
      say(`Import refusé : ${result.error}. Rien n'a été modifié.`, false)
    }
  })

  section.querySelector('.system__reset').addEventListener('click', () => {
    if (!globalThis.confirm?.('Réinitialiser tous les réglages ?')) return
    store.reset()
    sayAfterRerender('Réglages réinitialisés.')
  })

  return section
}
