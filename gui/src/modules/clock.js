const pad = (n) => String(n).padStart(2, '0')

export function formatTime(date, { seconds }) {
  const parts = [pad(date.getHours()), pad(date.getMinutes())]
  if (seconds) parts.push(pad(date.getSeconds()))
  return parts.join(':')
}

// DD/MM/YYYY, the format the deck's owner reads. Assembled from the local
// getters rather than toLocaleDateString: the latter's output depends on the
// browser's locale, which on an Android phone is whatever the system is set
// to — this stamp has to be the same on every device the deck is opened on.
export function formatDate(date) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

let timer = null

export default {
  id: 'clock',
  title: 'Chrono',
  // Always the footer, never a placement setting — see layout.css's own
  // comment on why. Declared here, read by core/registry.js's containerFor,
  // rather than a hardcoded id check in main.js.
  band: 'foot',

  settings: [
    { key: 'seconds', type: 'bool', label: 'Afficher les secondes', default: false },
  ],

  mount(el, ctx) {
    el.innerHTML = '<div class="clock__time"></div><div class="clock__date"></div>'
    const timeEl = el.querySelector('.clock__time')
    const dateEl = el.querySelector('.clock__date')

    const render = () => {
      const now = new Date()
      timeEl.textContent = formatTime(now, ctx.settings)
      dateEl.textContent = formatDate(now)
    }

    render()
    // One tick per second only when seconds are shown; otherwise per minute,
    // which is 60 times fewer wakeups on a screen that stays on.
    const period = ctx.settings.seconds ? 1000 : 60000
    timer = setInterval(render, period)
    ctx.onSettingsChange(() => {
      clearInterval(timer)
      render()
      timer = setInterval(render, ctx.settings.seconds ? 1000 : 60000)
    })
  },

  unmount() {
    clearInterval(timer)
    timer = null
  },
}
