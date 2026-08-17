/* Error boundary.
 *
 * Without one, any throw during render unmounts the whole tree and the
 * page goes black with no explanation — which on a phone means no console
 * to open and nothing to report. This shows the error, and offers the one
 * fix that resolves most post-deploy failures: drop the service worker
 * cache that is still serving an old build.
 */

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[life-os] render failed', error, info)
    this.setState({ info })
  }

  reset = async () => {
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
      await Promise.all(regs.map((r) => r.unregister()))
      const keys = (await globalThis.caches?.keys()) ?? []
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch {
      /* nothing to clear */
    }
    location.reload()
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen grid place-content-center gap-3 p-8 text-center">
        <h1 className="text-[15px] font-semibold text-ink">Something broke on this screen</h1>
        <p className="text-[13px] text-ink-2 max-w-[46ch] mx-auto">
          Your data is safe — it is stored on the device and nothing here touched it.
        </p>
        <pre className="text-[11.5px] text-left whitespace-pre-wrap break-words bg-surface border border-line rounded-[10px] p-3 max-w-[60ch] mx-auto text-critical">
          {String(error.message || error)}
          {info?.componentStack ? `\n${info.componentStack.trim().split('\n').slice(0, 6).join('\n')}` : ''}
        </pre>
        <div className="flex gap-2 justify-center flex-wrap">
          <button
            onClick={() => this.setState({ error: null, info: null })}
            className="text-[13px] px-3.5 py-2 rounded-[10px] border border-line bg-surface hover:bg-surface-3"
          >
            Try again
          </button>
          <button
            onClick={() => { location.hash = '#/today'; this.setState({ error: null, info: null }) }}
            className="text-[13px] px-3.5 py-2 rounded-[10px] border border-line bg-surface hover:bg-surface-3"
          >
            Back to Today
          </button>
          <button
            onClick={this.reset}
            className="text-[13px] px-3.5 py-2 rounded-[10px] border border-transparent bg-accent text-white"
          >
            Clear cache and reload
          </button>
        </div>
        <p className="text-[12px] text-ink-3 max-w-[46ch] mx-auto">
          After a deploy, a service worker can keep serving the previous build. Clearing the cache is usually the fix.
        </p>
      </div>
    )
  }
}
