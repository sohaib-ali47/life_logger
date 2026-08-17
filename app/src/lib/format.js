/* Formatting — one place, so a value looks the same everywhere. */

import { primitiveOf } from './primitives'
import { pad } from './dates'

export function fmtMinutes(min) {
  const m = Math.round(min || 0)
  if (!m) return '0m'
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h && r) return `${h}h ${r}m`
  return h ? `${h}h` : `${r}m`
}

export function fmtClock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  return (h ? `${h}:${pad(m)}` : `${m}`) + `:${pad(s)}`
}

export function fmtNumber(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const v = Math.round(n * 10 ** digits) / 10 ** digits
  return v.toLocaleString(undefined, { maximumFractionDigits: digits })
}

/** the display string for a section value */
export function fmtValue(section, value) {
  const p = primitiveOf(section)
  if (value === null || value === undefined) return '—'
  switch (section.primitive) {
    case 'checklist': {
      const n = section.variants?.length ?? 0
      return n ? `${Math.round(value)} of ${n}` : `${Math.round(value)}`
    }
    case 'note':
      return `${Math.round(value)}`
    case 'duration':
    case 'session':
      return fmtMinutes(value)
    case 'scale':
      return value ? fmtNumber(value, 1) : '—'
    case 'check':
      return value ? 'Done' : 'Not yet'
    case 'abstain':
      return `${Math.round(value)} ${Math.round(value) === 1 ? 'day' : 'days'}`
    case 'measure':
      return value ? `${fmtNumber(value, 1)}${section.unit ? ` ${section.unit}` : ''}` : '—'
    case 'count':
      if (section.unit === 'ml') {
        return value >= 1000 ? `${fmtNumber(value / 1000, 1)} L` : `${Math.round(value)} ml`
      }
      return `${fmtNumber(value, 0)}${section.unit ? ` ${section.unit}` : ''}`
    default:
      return `${fmtNumber(value)}${p?.unit ? ` ${p.unit}` : ''}`
  }
}

/** big number split from its unit, so the unit can be set smaller */
export function splitValue(section, value) {
  switch (section.primitive) {
    case 'checklist':
      return { text: String(Math.round(value || 0)), unit: `of ${section.variants?.length ?? 0}` }
    case 'note':
      return { text: String(Math.round(value || 0)), unit: value === 1 ? 'entry' : 'entries' }
    case 'duration':
    case 'session':
      return { text: fmtMinutes(value), unit: '' }
    case 'scale':
      return { text: value ? String(Math.round(value * 10) / 10) : '—', unit: '/10' }
    case 'check':
      return { text: value ? 'Done' : '—', unit: '' }
    case 'abstain':
      return { text: String(Math.round(value || 0)), unit: 'days' }
    case 'measure':
      return { text: value ? fmtNumber(value, 1) : '—', unit: section.unit || '' }
    case 'count':
      if (section.unit === 'ml' && value >= 1000) return { text: fmtNumber(value / 1000, 1), unit: 'L' }
      return { text: fmtNumber(value, 0), unit: section.unit || '' }
    default:
      return { text: fmtNumber(value), unit: '' }
  }
}

/** the y-axis unit for a section's chart */
export function axisUnit(section) {
  if (section.primitive === 'duration' || section.primitive === 'session') return 'hours'
  if (section.primitive === 'scale') return '/10'
  return section.unit || 'count'
}

/** duration charts plot hours, everything else plots its own unit */
export const chartDivisor = (section) =>
  section.primitive === 'duration' || section.primitive === 'session' ? 60 : 1

/** how a quick-add chip is labelled — a named preset wins over the raw
    number, because "Glass" is what you actually think in */
export function fmtQuick(section, preset) {
  const amount = typeof preset === 'object' ? preset.value : preset
  const label = typeof preset === 'object' ? preset.label : null
  if (label) return label
  if (section.primitive === 'duration' || section.primitive === 'session') return fmtMinutes(amount)
  if (section.unit === 'ml') return `${amount} ml`
  return `+${amount}`
}

export const quickValue = (preset) => (typeof preset === 'object' ? preset.value : preset)

/** the secondary line under a named preset — "Glass · 250 ml" */
export function quickHint(section, preset) {
  if (typeof preset !== 'object' || !preset.label) return null
  if (section.primitive === 'duration' || section.primitive === 'session') return null
  return section.unit ? `${preset.value} ${section.unit}` : String(preset.value)
}

export const pct = (n) => `${Math.round((n || 0) * 100)}%`
