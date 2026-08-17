/* The component kit — everything visual is built from these, so spacing,
   radii and states stay identical across every screen. */

import { useEffect, useRef } from 'react'
import Icon from './Icon'

export const slotVar = (section) => `var(--s${section.slot ?? 1})`

/* ── Card ──────────────────────────────────────────────────────────── */
export function Card({ title, sub, tools, children, className = '', ...rest }) {
  return (
    <section
      className={`bg-surface border border-line rounded-[18px] p-4 ${className}`}
      {...rest}
    >
      {(title || tools) && (
        <div className="flex items-baseline justify-between gap-3">
          {title && <h2 className="text-[13.5px] font-semibold tracking-tight">{title}</h2>}
          {tools && <div className="flex items-center gap-1.5">{tools}</div>}
        </div>
      )}
      {sub && <p className="text-[12px] text-ink-3 mt-0.5 mb-3">{sub}</p>}
      {!sub && (title || tools) && <div className="h-3" />}
      {children}
    </section>
  )
}

/* ── Buttons ───────────────────────────────────────────────────────── */
const BTN = {
  base: 'inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium whitespace-nowrap transition-colors active:translate-y-px disabled:opacity-40 disabled:pointer-events-none',
  size: { md: 'h-9 px-3 text-[13px]', sm: 'h-8 px-2.5 text-[12.5px]', lg: 'h-11 px-4 text-[14px]' },
  tone: {
    default: 'bg-surface border border-line hover:bg-surface-3',
    primary: 'bg-accent text-white border border-transparent hover:brightness-95',
    ghost: 'text-ink-2 hover:bg-surface-3 hover:text-ink',
    danger: 'text-critical border border-critical/30 hover:bg-critical/10',
    quiet: 'bg-surface-2 text-ink-2 hover:text-ink hover:bg-surface-3',
  },
}

export function Button({ tone = 'default', size = 'md', icon, children, className = '', ...rest }) {
  return (
    <button className={`${BTN.base} ${BTN.size[size]} ${BTN.tone[tone]} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 15} />}
      {children}
    </button>
  )
}

export function IconButton({ name, label, size = 34, tone = 'ghost', className = '', ...rest }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`grid place-items-center rounded-[10px] transition-colors ${
        tone === 'bordered' ? 'bg-surface border border-line hover:bg-surface-3' : 'text-ink-2 hover:bg-surface-3 hover:text-ink'
      } ${className}`}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon name={name} size={Math.round(size * 0.48)} />
    </button>
  )
}

/* ── Chip ──────────────────────────────────────────────────────────── */
export function Chip({ children, tint, className = '', ...rest }) {
  return (
    <button
      className={`h-8 px-3 rounded-[9px] text-[12.5px] font-medium bg-surface-2 text-ink-2 border border-transparent transition-colors hover:text-ink ${className}`}
      style={tint ? { '--tint': tint } : undefined}
      onMouseEnter={(e) => {
        if (!tint) return
        e.currentTarget.style.background = `color-mix(in oklab, ${tint} 18%, var(--surface-2))`
        e.currentTarget.style.borderColor = `color-mix(in oklab, ${tint} 34%, transparent)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = ''
        e.currentTarget.style.borderColor = ''
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ── Segmented control ─────────────────────────────────────────────── */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="inline-flex p-[3px] gap-[2px] bg-surface-2 border border-line rounded-[11px]" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded-[8px] text-[12.5px] font-medium transition-colors ${
            value === o.value ? 'bg-surface text-ink' : 'text-ink-3 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── Progress ring ─────────────────────────────────────────────────── */
export function Ring({ value = 0, size = 42, stroke = 4, tint = 'var(--accent)', track = 'var(--surface-2)', children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, value))
  return (
    <div className="relative shrink-0 grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tint}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .4s cubic-bezier(.2,.7,.3,1)' }}
        />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  )
}

/* ── Meter (bullet bar with a target notch) ────────────────────────── */
export function Meter({ label, valueText, ratio, tint, over = false, hit = false }) {
  const width = Math.min(100, (Math.max(0, ratio) * 100) / 1.25)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[12.5px] font-medium flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: tint }} />
          {label}
          {over && <span className="text-[11px] text-ink-3">· cap</span>}
        </span>
        <span className="text-[12px] text-ink-2 num">{valueText}</span>
      </div>
      <div className="relative h-2 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
          style={{ width: `${width}%`, background: over && !hit ? 'var(--critical)' : tint }}
        />
        <div className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-ink-3" style={{ left: '80%' }} />
      </div>
    </div>
  )
}

/* ── Stat tile ─────────────────────────────────────────────────────── */
export function Stat({ label, value, unit, delta, children }) {
  return (
    <div className="bg-surface border border-line rounded-[18px] p-4">
      <div className="text-[11.5px] text-ink-3 font-medium">{label}</div>
      <div className="text-[24px] font-semibold tracking-tight leading-none mt-1.5">
        {value}
        {unit && <span className="text-[13px] font-medium text-ink-3 ml-1">{unit}</span>}
      </div>
      {delta && <Delta {...delta} />}
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}

export function Delta({ tone = 'flat', arrow = 'flat', text }) {
  const color = tone === 'good' ? 'text-good-text' : tone === 'bad' ? 'text-critical' : 'text-ink-3'
  const name = arrow === 'up' ? 'arrowUp' : arrow === 'down' ? 'arrowDown' : 'dash'
  return (
    <div className={`text-[12px] font-medium inline-flex items-center gap-1 mt-1.5 ${color}`}>
      <Icon name={name} size={13} />
      <span>{text}</span>
    </div>
  )
}

/* ── Empty state ───────────────────────────────────────────────────── */
export function Empty({ icon = 'inbox', children }) {
  return (
    <div className="grid place-items-center gap-2.5 py-9 text-center text-ink-3 text-[13px]">
      <div className="w-10 h-10 rounded-[13px] grid place-items-center bg-surface-2">
        <Icon name={icon} size={19} />
      </div>
      <p className="max-w-[38ch]">{children}</p>
    </div>
  )
}

/* ── Sheet (bottom sheet on phones, dialog on desktop) ─────────────── */
export function Sheet({ open, onClose, title, children, footer }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onCancel = (e) => { e.preventDefault(); onClose() }
    el.addEventListener('cancel', onCancel)
    return () => el.removeEventListener('cancel', onCancel)
  }, [onClose])

  return (
    <dialog
      ref={ref}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className="bg-transparent p-0 m-0 max-w-none w-full h-full max-h-none backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="min-h-full flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div
          className="w-full sm:max-w-[440px] bg-surface border border-line rounded-t-[22px] sm:rounded-[22px] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 px-5 pt-4">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <IconButton name="x" label="Close" onClick={onClose} size={32} />
          </div>
          <div className="px-5 py-4 grid gap-3.5">{children}</div>
          {footer && <div className="px-5 pb-5 pt-1 flex justify-end gap-2 pb-safe">{footer}</div>}
        </div>
      </div>
    </dialog>
  )
}

/* ── Form fields ───────────────────────────────────────────────────── */
export function Field({ label, hint, children }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] text-ink-2 font-medium">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-ink-3">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'h-10 px-3 rounded-[10px] bg-surface-2 border border-line text-ink w-full focus:border-accent outline-none'

/* ── Toast ─────────────────────────────────────────────────────────── */
export function Toast({ toast, onDismiss }) {
  if (!toast) return null
  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 bg-surface border border-line rounded-[13px] pl-4 pr-2 py-2 text-[13px] shadow-2xl"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
    >
      <span>{toast.message}</span>
      {toast.action && (
        <Button size="sm" tone="quiet" onClick={() => { toast.action.run(); onDismiss() }}>
          {toast.action.label}
        </Button>
      )}
      <IconButton name="x" label="Dismiss" size={28} onClick={onDismiss} />
    </div>
  )
}

/* ── Section colour dot ────────────────────────────────────────────── */
export const Dot = ({ tint, size = 10 }) => (
  <span className="rounded-[3px] shrink-0 inline-block" style={{ background: tint, width: size, height: size }} />
)
