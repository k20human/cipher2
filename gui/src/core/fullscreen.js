// Two different mechanisms put this deck full screen, and it needs both.
//
// The manifest's `display: fullscreen` is the automatic one: the installed app
// launches with no status bar and no navigation bar, without anything being
// asked of the user. It only applies to the installed app, though — opened as
// an ordinary tab, the deck is a page like any other.
//
// The Fullscreen API covers that second case, and cannot cover the first:
// requestFullscreen() is refused unless it is called from a user gesture, so
// there is no way to reach for it on load. Hence a button, which is exactly
// the gesture the API is waiting for.
//
// The two are invisible to each other. An app launched full screen from the
// manifest has a null document.fullscreenElement — it never called the API —
// while a page put full screen through the API reports display-mode: browser.
// Testing only one of them offers the button to someone who is already full
// screen, or hides it from someone who is not.

// Exported and pure so the rule can be checked without a document: the wrong
// answer here is a button that lies about the state of the screen, which is
// not something the eye catches in a screenshot.
export function shouldOfferFullscreen({ supported, displayMode, fullscreenElement }) {
  if (!supported) return false
  if (fullscreenElement) return false
  return displayMode !== 'fullscreen'
}

// globalThis.document, not a bare `document`: a default parameter is evaluated
// before the function body, so a bare reference throws a ReferenceError under
// Node before the guard below ever runs — including on the call that passes no
// button at all and has nothing to do.
export function setupFullscreen(button, doc = globalThis.document, win = globalThis.window) {
  if (!button || !doc) return () => {}

  const supported = typeof doc.documentElement?.requestFullscreen === 'function'
  const query = win?.matchMedia?.('(display-mode: fullscreen)') ?? null

  const refresh = () => {
    button.hidden = !shouldOfferFullscreen({
      supported,
      displayMode: query?.matches ? 'fullscreen' : 'browser',
      fullscreenElement: doc.fullscreenElement,
    })
  }

  const request = () => {
    // Rejected rather than thrown when the browser declines — a refusal is
    // routine (an unsupported context, a gesture the browser did not count)
    // and must not surface as an unhandled rejection in the console.
    doc.documentElement.requestFullscreen?.().catch(() => {})
  }

  button.addEventListener('click', request)
  doc.addEventListener('fullscreenchange', refresh)
  // The manifest case can change under the app's feet: an installed PWA
  // reports display-mode: fullscreen only once the launcher has honoured it,
  // and Chrome re-mints an installed WebAPK in the background when the
  // manifest changes. Listening means the button disappears on its own the
  // first time the app comes up full screen, rather than at the next reload.
  query?.addEventListener?.('change', refresh)

  refresh()

  return () => {
    button.removeEventListener('click', request)
    doc.removeEventListener('fullscreenchange', refresh)
    query?.removeEventListener?.('change', refresh)
  }
}
