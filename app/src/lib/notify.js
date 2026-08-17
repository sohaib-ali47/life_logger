/* Notifications.
 *
 * What actually works, honestly:
 *   · Desktop and Android — the Notification API fires while the app is
 *     open, and the service worker can show one shortly after it closes.
 *   · iPhone — the API only exists once the app is installed to the Home
 *     Screen (iOS 16.4+), and anything delivered while the app is fully
 *     closed needs a push server. That is Phase 5.
 *
 * So this module is deliberately modest: it asks once, remembers the
 * answer, and mirrors in-app nudges to the OS when it is allowed to. The
 * in-app banner is always the source of truth — the OS notification is a
 * bonus, never the only place a reminder appears.
 */

const KEY = 'life-os.notified'

export const supported = () => typeof window !== 'undefined' && 'Notification' in window

export const permission = () => (supported() ? Notification.permission : 'unsupported')

export async function requestPermission() {
  if (!supported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

/** true once installed to the Home Screen / installed as a PWA */
export function isInstalled() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** what to tell the user about their current notification situation */
export function status() {
  if (!supported()) {
    return isIOS() && !isInstalled()
      ? { level: 'install', text: 'Add Life OS to your Home Screen to turn on notifications.' }
      : { level: 'unsupported', text: 'This browser cannot show notifications.' }
  }
  if (Notification.permission === 'granted') return { level: 'on', text: 'Notifications are on for this device.' }
  if (Notification.permission === 'denied') return { level: 'denied', text: 'Notifications are blocked in your browser settings.' }
  return { level: 'ask', text: 'Notifications are off. Turn them on to get reminders while the app is open.' }
}

/* One notification per id per session — a nudge that re-renders must not
   fire the OS notification again. Read defensively: this runs at import
   time, and a throw here would take the whole bundle down before React
   ever mounts. */
const fired = new Set(
  (() => {
    try {
      return JSON.parse(globalThis.sessionStorage?.getItem(KEY) || '[]')
    } catch {
      return []
    }
  })()
)

function remember(id) {
  fired.add(id)
  try {
    globalThis.sessionStorage?.setItem(KEY, JSON.stringify([...fired].slice(-200)))
  } catch { /* private mode — in-memory is fine */ }
}

export function fire(id, title, body) {
  if (!supported() || Notification.permission !== 'granted' || fired.has(id)) return false
  remember(id)
  try {
    const n = new Notification(title, {
      body,
      tag: id,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      silent: false,
    })
    n.onclick = () => { window.focus(); n.close() }
    return true
  } catch {
    return false
  }
}

/** vibrate on phones that allow it — a nudge you feel without looking */
export function buzz(pattern = [40, 60, 40]) {
  try { navigator.vibrate?.(pattern) } catch { /* unsupported */ }
}
