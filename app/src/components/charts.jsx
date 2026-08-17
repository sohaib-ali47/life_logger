/* Charts — hand-rolled SVG. No chart library.
 *
 * House rules, enforced once here for every chart:
 *   · marks ≤24px thick, 4px rounded data-end, square at the baseline
 *   · a 2px surface gap between touching fills — never a stroke
 *   · hairline solid gridlines, one step off the surface, recessive
 *   · 2px lines, markers ≥8px carrying a 2px surface ring
 *   · text wears ink tokens, never the series colour
 *   · one y-axis, always — never a second scale
 *   · every chart has a table twin, so no value is hover-gated
 */

import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Icon from './Icon'
import { IconButton, slotVar } from './ui'
import { fmtMinutes, fmtNumber, fmtValue, chartDivisor, axisUnit } from '../lib/format'
import { fmtDay, pad, MIN_PER_DAY, weekIndex, weekdayNames, parse, weekStart } from '../lib/dates'
import { rollingMean, dailyTarget } from '../lib/stats'

const GAP = 2
const BAR_MAX = 24
const RADIUS = 4

/* ── geometry helpers ──────────────────────────────────────────────── */

function niceScale(max, count = 4) {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] }
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag
  const top = Math.ceil(max / step) * step
  const ticks = []
  for (let v = 0; v <= top + step * 1e-6; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return { max: top, ticks }
}

/** rounded data-end at the top, square at the baseline */
function barPath(x, y, w, h, roundTop) {
  if (h <= 0) return ''
  const r = roundTop ? Math.min(RADIUS, w / 2, h) : 0
  if (!r) return `M${x} ${y}h${w}v${h}h${-w}Z`
  return `M${x} ${y + h}V${y + r}a${r} ${r} 0 0 1 ${r} ${-r}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${y + h}Z`
}

function hBarPath(x, y, w, h) {
  const r = Math.min(RADIUS, h / 2, w)
  if (w <= 0) return ''
  if (w <= r) return `M${x} ${y}h${w}v${h}h${-w}Z`
  return `M${x} ${y}h${w - r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}H${x}Z`
}

/* ── tooltip ───────────────────────────────────────────────────────── */

const TipCtx = createContext(null)
export const useTip = () => useContext(TipCtx)

export function TipProvider({ children }) {
  const [tip, setTip] = useState(null)
  const show = useCallback((data, ev) => {
    const x = ev?.clientX ?? 0
    const y = ev?.clientY ?? 0
    setTip({ ...data, x, y })
  }, [])
  const hide = useCallback(() => setTip(null), [])
  return (
    <TipCtx.Provider value={{ show, hide }}>
      {children}
      {tip && <TipBox tip={tip} />}
    </TipCtx.Provider>
  )
}

function TipBox({ tip }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let left = tip.x + 14
    let top = tip.y + 14
    if (left + r.width > window.innerWidth - 8) left = tip.x - r.width - 14
    if (top + r.height > window.innerHeight - 8) top = tip.y - r.height - 14
    setPos({ left: Math.max(8, left), top: Math.max(8, top) })
  }, [tip])

  return (
    <div
      ref={ref}
      role="status"
      className="fixed z-[80] pointer-events-none bg-surface border border-line rounded-[11px] px-3 py-2.5 shadow-2xl text-[12px] min-w-[140px] max-w-[260px]"
      style={pos}
    >
      {tip.title && <div className="text-[11.5px] text-ink-3 font-semibold mb-1.5">{tip.title}</div>}
      {tip.rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[14px_1fr_auto] items-center gap-2 py-[1px]">
          <span className="h-0.5 rounded-full" style={{ background: r.color || 'transparent' }} />
          <span className="text-ink-2 truncate">{r.name}</span>
          <span className="font-semibold num">{r.value}</span>
        </div>
      ))}
      {tip.foot && (
        <div className="mt-1.5 pt-1.5 border-t border-line flex justify-between text-ink-3">
          <span>{tip.foot[0]}</span>
          <span className="num">{tip.foot[1]}</span>
        </div>
      )}
    </div>
  )
}

/** attaches hover + keyboard-focus tooltips to a mark's hit target */
function useHit(build) {
  const tip = useTip()
  return {
    onPointerEnter: (e) => tip.show(build(), e),
    onPointerMove: (e) => tip.show(build(), e),
    onPointerLeave: () => tip.hide(),
    onFocus: (e) => {
      const r = e.currentTarget.getBoundingClientRect()
      tip.show(build(), { clientX: r.left + r.width / 2, clientY: r.top })
    },
    onBlur: () => tip.hide(),
  }
}

/* ── width measurement ─────────────────────────────────────────────── */

export function useWidth(min = 260) {
  const ref = useRef(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setW(Math.max(min, entry.contentRect.width)))
    ro.observe(el)
    setW(Math.max(min, el.clientWidth))
    return () => ro.disconnect()
  }, [min])
  return [ref, w]
}

/* ── card shell with the table twin ────────────────────────────────── */

export function ChartCard({ title, sub, legend, tools, note, className = '', children }) {
  const [showTable, setShowTable] = useState(false)
  const [ref, width] = useWidth()

  return (
    <section className={`bg-surface border border-line rounded-[18px] p-4 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13.5px] font-semibold tracking-tight">{title}</h2>
        <div className="flex items-center gap-1.5">
          {tools}
          <IconButton
            name="table"
            size={30}
            label={showTable ? 'Show chart' : 'Show data table'}
            aria-pressed={showTable}
            onClick={() => setShowTable((v) => !v)}
          />
        </div>
      </div>
      {sub && <p className="text-[12px] text-ink-3 mt-0.5 mb-3">{sub}</p>}
      <div ref={ref} className="overflow-x-auto overflow-y-hidden">
        {width > 0 && children({ width, showTable })}
      </div>
      {legend}
      {note && <p className="text-[11.5px] text-ink-3 mt-3">{note}</p>}
    </section>
  )
}

export function DataTable({ columns, rows }) {
  return (
    <div className="max-h-[330px] overflow-auto border border-line rounded-[12px] mt-1">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={`sticky top-0 bg-surface-2 text-ink-2 font-semibold px-2.5 py-2 whitespace-nowrap ${
                  i === 0 ? 'text-left' : 'text-right'
                }`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={`px-2.5 py-1.5 whitespace-nowrap ${j === 0 ? 'text-left' : 'text-right num'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── legend ────────────────────────────────────────────────────────── */

export function Legend({ items, onToggle }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-3">
      {items.map((it) => {
        const inner = (
          <>
            <span
              className={it.shape === 'line' ? 'w-3.5 h-0.5 rounded-full' : 'w-2.5 h-2.5 rounded-[3px]'}
              style={{ background: it.color }}
            />
            <span>{it.name}</span>
          </>
        )
        return onToggle ? (
          <button
            key={it.id ?? it.name}
            type="button"
            aria-pressed={!it.off}
            onClick={() => onToggle(it.id)}
            className={`inline-flex items-center gap-1.5 text-[12px] text-ink-2 hover:text-ink transition-opacity ${
              it.off ? 'opacity-40' : ''
            }`}
          >
            {inner}
          </button>
        ) : (
          <span key={it.id ?? it.name} className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
            {inner}
          </span>
        )
      })}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   1. Daily allocation — stacked columns, 24 hours per day
   ══════════════════════════════════════════════════════════════════════ */

export function Allocation({ width, showTable, keys, sections, byDay, hidden = {}, onPickDay }) {
  const stackable = useMemo(
    () => sections.filter((s) => s.countsToDay).sort((a, b) => a.slot - b.slot),
    [sections]
  )
  const shown = stackable.filter((s) => !hidden[s.id])

  /* bucket to weeks past ~6 weeks so bars never get thinner than a hair */
  const weekly = keys.length > 45
  const buckets = useMemo(() => {
    if (!weekly) return keys.map((k) => ({ id: k, label: fmtDay(k, 'short'), days: [k] }))
    const out = []
    let cur = null
    for (const k of keys) {
      const ws = weekStart(k)
      if (!cur || cur.id !== ws) { cur = { id: ws, label: fmtDay(ws, 'short'), days: [] }; out.push(cur) }
      cur.days.push(k)
    }
    return out
  }, [keys, weekly])

  const data = useMemo(
    () =>
      buckets.map((b) => {
        const vals = {}
        let acct = 0
        for (const s of shown) {
          let sum = 0
          for (const k of b.days) sum += byDay[k]?.[s.id] ?? 0
          vals[s.id] = sum / b.days.length
          acct += vals[s.id]
        }
        return { ...b, vals, accounted: Math.min(acct, MIN_PER_DAY), unlogged: Math.max(0, MIN_PER_DAY - acct) }
      }),
    [buckets, shown, byDay]
  )

  if (showTable) {
    return (
      <DataTable
        columns={[weekly ? 'Week of' : 'Day', ...shown.map((s) => `${s.name} (h)`), 'Unaccounted (h)']}
        rows={data.map((b) => [
          b.label,
          ...shown.map((s) => (b.vals[s.id] / 60).toFixed(1)),
          (b.unlogged / 60).toFixed(1),
        ])}
      />
    )
  }

  const padL = 34, padR = 8, padT = 10, padB = 26
  const plotH = 210
  const H = plotH + padT + padB
  const plotW = width - padL - padR
  const band = plotW / Math.max(1, data.length)
  const bw = Math.min(BAR_MAX, Math.max(3, band * 0.66))
  const yOf = (m) => padT + plotH - (m / MIN_PER_DAY) * plotH
  const showUnlogged = !hidden.__unlogged
  const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 58))))

  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Daily time allocation">
      {[0, 360, 720, 1080, 1440].map((m) => {
        const y = Math.round(yOf(m)) + 0.5
        return (
          <g key={m}>
            <line className={m === 0 ? 'axis-line' : 'grid-line'} x1={padL} x2={width - padR} y1={y} y2={y} />
            <text className="axis-label" x={padL - 8} y={y + 3.5} textAnchor="end">{m / 60}h</text>
          </g>
        )
      })}

      {data.map((b, i) => {
        const x = padL + i * band + (band - bw) / 2
        const segs = shown
          .filter((s) => b.vals[s.id] > 0)
          .map((s) => ({ id: s.id, name: s.name, v: b.vals[s.id], color: slotVar(s) }))
        if (showUnlogged && b.unlogged > 0) segs.push({ id: '__unlogged', name: 'Unaccounted', v: b.unlogged, color: 'var(--s-none)' })

        let cursor = padT + plotH
        const marks = segs.map((s, si) => {
          const raw = (s.v / MIN_PER_DAY) * plotH
          const isTop = si === segs.length - 1
          const h = Math.max(1, raw - (isTop ? 0 : GAP))
          const y = cursor - raw
          cursor = y
          return <path key={s.id} d={barPath(x, y, bw, h, isTop)} fill={s.color} />
        })

        return (
          <g key={b.id}>
            {marks}
            <Hit
              x={padL + i * band}
              y={padT}
              w={band}
              h={plotH}
              label={`${b.label}, ${fmtMinutes(b.accounted)} accounted`}
              onActivate={!weekly && onPickDay ? () => onPickDay(b.id) : undefined}
              build={() => ({
                title: weekly ? `Week of ${fmtDay(b.id, 'short')}` : fmtDay(b.id),
                rows: [...segs].reverse().map((s) => ({ name: s.name, value: fmtMinutes(s.v), color: s.color })),
                foot: ['Accounted', `${Math.round((b.accounted / MIN_PER_DAY) * 100)}%`],
              })}
            />
          </g>
        )
      })}

      {data.map((b, i) =>
        i % every === 0 || i === data.length - 1 ? (
          <text key={b.id} className="axis-label" x={padL + i * band + band / 2} y={H - 8} textAnchor="middle">
            {b.label}
          </text>
        ) : null
      )}
    </svg>
  )
}

/** transparent hit target — always larger than the mark it serves */
function Hit({ x, y, w, h, label, build, onActivate }) {
  const handlers = useHit(build)
  return (
    <rect
      className="hit"
      x={x}
      y={y}
      width={w}
      height={h}
      tabIndex={0}
      role={onActivate ? 'button' : 'img'}
      aria-label={label}
      onClick={onActivate}
      onKeyDown={(e) => { if (onActivate && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onActivate() } }}
      {...handlers}
    />
  )
}

/* ══════════════════════════════════════════════════════════════════════
   2. Composition — one 100% stacked row
   ══════════════════════════════════════════════════════════════════════ */

export function Composition({ width, showTable, parts, height = 34 }) {
  const live = parts.filter((p) => p.value > 0)
  const total = live.reduce((a, p) => a + p.value, 0) || 1

  if (showTable) {
    return (
      <DataTable
        columns={['Part', 'Share', 'Total']}
        rows={live.map((p) => [p.name, `${Math.round((p.value / total) * 100)}%`, p.display ?? fmtMinutes(p.value)])}
      />
    )
  }

  let x = 0
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Composition">
      {live.map((p, i) => {
        const raw = (p.value / total) * width
        const last = i === live.length - 1
        const w = Math.max(1, raw - (last ? 0 : GAP))
        const at = x
        x += raw
        return (
          <g key={p.name}>
            <rect x={at} y={6} width={w} height={18} rx={Math.min(5, w / 2)} fill={p.color} />
            <Hit
              x={at}
              y={0}
              w={raw}
              h={height}
              label={p.name}
              build={() => ({
                title: p.name,
                rows: [
                  { name: 'Share', value: `${Math.round((p.value / total) * 100)}%`, color: p.color },
                  { name: 'Total', value: p.display ?? fmtMinutes(p.value) },
                ],
              })}
            />
          </g>
        )
      })}
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   3. Trend — daily marks + 7-day rolling mean + target line
   ══════════════════════════════════════════════════════════════════════ */

export function Trend({ width, showTable, section, points, height = 180, showTarget = true }) {
  const div = chartDivisor(section)
  const ignoreZeros = section.primitive === 'scale' || section.primitive === 'measure'
  const vals = points.map((p) => p.value / div)
  const mean = rollingMean(points, 7, ignoreZeros).map((v) => (v === null ? null : v / div))
  const dt = dailyTarget(section)
  const target = showTarget && dt !== null ? dt / div : null

  if (showTable) {
    return (
      <DataTable
        columns={['Day', `${section.name} (${axisUnit(section)})`, '7-day mean']}
        rows={points.map((p, i) => [
          fmtDay(p.key, 'short'),
          fmtNumber(vals[i]),
          mean[i] === null ? '—' : fmtNumber(mean[i]),
        ])}
      />
    )
  }

  const floor = section.primitive === 'scale' ? 10 : 1
  const scale = niceScale(Math.max(...vals, target ?? 0, floor), 4)
  const padL = 38, padR = 12, padT = 12, padB = 26
  const H = height + padT + padB
  const plotW = width - padL - padR
  const band = plotW / Math.max(1, points.length)
  const bw = Math.min(BAR_MAX, Math.max(2, band - GAP * 2))
  const yOf = (v) => padT + height - (v / scale.max) * height
  const xOf = (i) => padL + i * band + band / 2
  const tint = slotVar(section)
  const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotW / 56))))

  let d = ''
  let open = false
  mean.forEach((v, i) => {
    if (v === null) { open = false; return }
    d += `${open ? 'L' : 'M'}${xOf(i)} ${yOf(v)} `
    open = true
  })
  const lastMean = mean.reduce((acc, v, i) => (v === null ? acc : i), -1)

  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`${section.name} trend`}>
      {scale.ticks.map((t) => {
        const y = Math.round(yOf(t)) + 0.5
        return (
          <g key={t}>
            <line className={t === 0 ? 'axis-line' : 'grid-line'} x1={padL} x2={width - padR} y1={y} y2={y} />
            <text className="axis-label" x={padL - 8} y={y + 3.5} textAnchor="end">{fmtNumber(t)}</text>
          </g>
        )
      })}

      {points.map((p, i) =>
        vals[i] > 0 ? (
          <path
            key={p.key}
            d={barPath(xOf(i) - bw / 2, yOf(vals[i]), bw, padT + height - yOf(vals[i]), true)}
            fill={tint}
            opacity={0.5}
          />
        ) : null
      )}

      {target !== null && (
        <g>
          <line className="target-line" x1={padL} x2={width - padR} y1={Math.round(yOf(target)) + 0.5} y2={Math.round(yOf(target)) + 0.5} />
          <text className="axis-label" x={width - padR} y={yOf(target) - 6} textAnchor="end">target</text>
        </g>
      )}

      {d && <path d={d.trim()} fill="none" stroke={tint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {lastMean >= 0 && (
        <g>
          <circle cx={xOf(lastMean)} cy={yOf(mean[lastMean])} r={5.5} fill="var(--surface)" />
          <circle cx={xOf(lastMean)} cy={yOf(mean[lastMean])} r={4} fill={tint} />
        </g>
      )}

      {points.map((p, i) => (
        <Hit
          key={`h${p.key}`}
          x={padL + i * band}
          y={padT}
          w={band}
          h={height}
          label={fmtDay(p.key)}
          build={() => ({
            title: fmtDay(p.key),
            rows: [
              { name: section.name, value: fmtValue(section, p.value), color: tint },
              ...(mean[i] !== null
                ? [{ name: '7-day mean', value: `${fmtNumber(mean[i])}${div === 60 ? ' h' : ''}` }]
                : []),
            ],
          })}
        />
      ))}

      {points.map((p, i) =>
        i % every === 0 || i === points.length - 1 ? (
          <text key={`x${p.key}`} className="axis-label" x={xOf(i)} y={H - 8} textAnchor="middle">
            {fmtDay(p.key, 'short')}
          </text>
        ) : null
      )}
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   4. Ranked horizontal bars
   ══════════════════════════════════════════════════════════════════════ */

export function Ranked({ width, showTable, rows, metric = 'Total', onPick }) {
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  const max = Math.max(...sorted.map((r) => r.value), 1)

  if (showTable) {
    return <DataTable columns={['Section', metric]} rows={sorted.map((r) => [r.name, r.display])} />
  }

  const labelW = 84, valueW = 64, rowH = 30, barH = 12
  const H = sorted.length * rowH + 4
  const plotW = Math.max(40, width - labelW - valueW)

  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Ranked totals">
      {sorted.map((r, i) => {
        const y = i * rowH + 4
        const cy = y + rowH / 2 - 4
        const w = (r.value / max) * plotW
        return (
          <g key={r.id ?? r.name}>
            <text x={0} y={cy + 4} className="axis-label" textAnchor="start" fontSize="12" fill="var(--ink-2)">
              {r.name}
            </text>
            <path d={hBarPath(labelW, cy - barH / 2 + 2, Math.max(2, w), barH)} fill={r.color} />
            <text x={width} y={cy + 4} textAnchor="end" fontSize="12" fontWeight="600" fill="var(--ink)" className="num">
              {r.display}
            </text>
            <Hit
              x={0}
              y={y}
              w={width}
              h={rowH}
              label={`${r.name} ${r.display}`}
              onActivate={onPick ? () => onPick(r.id) : undefined}
              build={() => ({
                title: r.name,
                rows: [
                  { name: metric, value: r.display, color: r.color },
                  ...(r.sub ? [{ name: r.sub.name, value: r.sub.value }] : []),
                ],
              })}
            />
          </g>
        )
      })}
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   5. Consistency heatmap — one hue, light → dark
   ══════════════════════════════════════════════════════════════════════ */

export function Heatmap({ showTable, keys, valueOf, format, metric = 'Value', onPickDay }) {
  const vals = keys.map(valueOf)

  if (showTable) {
    return (
      <DataTable
        columns={['Day', metric]}
        rows={keys.map((k, i) => [fmtDay(k, 'short'), format ? format(vals[i]) : fmtNumber(vals[i])])}
      />
    )
  }

  const cell = 12, gap = 3, step = cell + gap, rowsN = 7
  const firstDow = weekIndex(keys[0])
  const cols = Math.ceil((keys.length + firstDow) / rowsN)
  const padL = 26, padT = 16
  const W = padL + cols * step
  const H = padT + rowsN * step + 4
  const max = Math.max(...vals, 1)
  const names = weekdayNames()
  let lastMonth = -1

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Consistency">
      {[0, 2, 4].map((r) => (
        <text key={r} className="axis-label" x={padL - 6} y={padT + r * step + cell - 2} textAnchor="end">
          {names[r]}
        </text>
      ))}
      {keys.map((k, i) => {
        const idx = i + firstDow
        const col = Math.floor(idx / rowsN)
        const row = idx % rowsN
        const x = padL + col * step
        const y = padT + row * step
        const v = vals[i]
        const level = v <= 0 ? 0 : Math.min(6, 1 + Math.floor((v / max) * 5.999))
        const month = parse(k).getMonth()
        const label = row === 0 && month !== lastMonth ? ((lastMonth = month), fmtDay(k, 'short').split(' ')[0]) : null
        return (
          <g key={k}>
            {label && <text className="axis-label" x={x + cell / 2} y={padT - 6} textAnchor="middle">{label}</text>}
            <HeatCell
              x={x} y={y} size={cell} level={level}
              label={fmtDay(k)}
              onActivate={onPickDay ? () => onPickDay(k) : undefined}
              build={() => ({
                title: fmtDay(k),
                rows: [{ name: metric, value: format ? format(v) : fmtNumber(v), color: `var(--q${Math.max(1, level)})` }],
              })}
            />
          </g>
        )
      })}
    </svg>
  )
}

function HeatCell({ x, y, size, level, label, build, onActivate }) {
  const handlers = useHit(build)
  return (
    <rect
      x={x} y={y} width={size} height={size} rx={2.5}
      fill={`var(--q${level})`}
      tabIndex={0}
      role={onActivate ? 'button' : 'img'}
      aria-label={label}
      className="cursor-pointer"
      onClick={onActivate}
      {...handlers}
    />
  )
}

export function HeatScale() {
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3 mt-3">
      <span>less</span>
      {[0, 2, 4, 6].map((q) => (
        <i key={q} className="w-3 h-3 rounded-[3px] block" style={{ background: `var(--q${q})` }} />
      ))}
      <span>more</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   6. Hour-of-day histogram
   ══════════════════════════════════════════════════════════════════════ */

export function Hours({ width, showTable, counts, color = 'var(--s1)', format, metric = 'Total' }) {
  if (showTable) {
    return (
      <DataTable
        columns={['Hour', metric]}
        rows={counts.map((v, h) => [`${pad(h)}:00`, format ? format(v) : fmtNumber(v)])}
      />
    )
  }

  const scale = niceScale(Math.max(...counts, 1), 3)
  const padL = 34, padR = 8, padT = 10, padB = 24
  const plotH = 120
  const H = plotH + padT + padB
  const plotW = width - padL - padR
  const band = plotW / 24
  const bw = Math.min(BAR_MAX, Math.max(3, band - GAP * 2))
  const yOf = (v) => padT + plotH - (v / scale.max) * plotH

  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Time of day">
      {scale.ticks.map((t) => {
        const y = Math.round(yOf(t)) + 0.5
        return (
          <g key={t}>
            <line className={t === 0 ? 'axis-line' : 'grid-line'} x1={padL} x2={width - padR} y1={y} y2={y} />
            <text className="axis-label" x={padL - 8} y={y + 3.5} textAnchor="end">{fmtNumber(t)}</text>
          </g>
        )
      })}
      {counts.map((v, h) => (
        <g key={h}>
          {v > 0 && (
            <path
              d={barPath(padL + h * band + (band - bw) / 2, yOf(v), bw, padT + plotH - yOf(v), true)}
              fill={color}
            />
          )}
          <Hit
            x={padL + h * band}
            y={padT}
            w={band}
            h={plotH}
            label={`${pad(h)}:00`}
            build={() => ({
              title: `${pad(h)}:00 – ${pad((h + 1) % 24)}:00`,
              rows: [{ name: metric, value: format ? format(v) : fmtNumber(v), color }],
            })}
          />
        </g>
      ))}
      {[0, 6, 12, 18, 23].map((h) => (
        <text key={h} className="axis-label" x={padL + h * band + band / 2} y={H - 7} textAnchor="middle">
          {pad(h)}:00
        </text>
      ))}
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   7. Day timeline — a 24h band showing where the blocks landed
   ══════════════════════════════════════════════════════════════════════ */

export function Timeline({ width, showTable, blocks, boundaryHour = 4 }) {
  if (showTable) {
    return (
      <DataTable
        columns={['Start', 'Section', 'Duration']}
        rows={blocks.map((b) => [b.label, b.section.name, fmtMinutes(b.minutes)])}
      />
    )
  }

  const H = 42
  const trackY = 8
  const trackH = 22

  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Day timeline">
      <rect x={0} y={trackY} width={width} height={trackH} rx={6} fill="var(--s-none)" />
      {blocks.map((b, i) => {
        const x = (b.startMin / MIN_PER_DAY) * width
        const w = Math.max(2, (b.minutes / MIN_PER_DAY) * width - 1)
        return (
          <g key={i}>
            <rect x={x} y={trackY} width={w} height={trackH} rx={Math.min(4, w / 2)} fill={slotVar(b.section)} />
            <Hit
              x={Math.max(0, x - 6)}
              y={0}
              w={w + 12}
              h={H}
              label={`${b.section.name} at ${b.label}`}
              build={() => ({
                title: b.section.name,
                rows: [{ name: b.label, value: fmtMinutes(b.minutes), color: slotVar(b.section) }],
              })}
            />
          </g>
        )
      })}
      {[0, 6, 12, 18, 24].map((h) => (
        <text
          key={h}
          className="axis-label"
          x={Math.min(width - 14, Math.max(14, (h / 24) * width))}
          y={H - 2}
          textAnchor="middle"
        >
          {pad((boundaryHour + h) % 24)}:00
        </text>
      ))}
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   8. Sparkline
   ══════════════════════════════════════════════════════════════════════ */

export function Sparkline({ values, width = 110, height = 26, color = 'var(--s1)' }) {
  if (!values.length) return null
  const max = Math.max(...values, 1)
  const xOf = (i) => (i / Math.max(1, values.length - 1)) * (width - 2) + 1
  const yOf = (v) => height - 2 - (v / max) * (height - 5)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${xOf(i)} ${yOf(v)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={`${d} L${xOf(values.length - 1)} ${height} L${xOf(0)} ${height} Z`} fill={color} fillOpacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   9. Streak bars — for abstain sections
   ══════════════════════════════════════════════════════════════════════ */

export function StreakChart({ width, showTable, keys, valueOf, resets, color = 'var(--s7)' }) {
  const vals = keys.map(valueOf)

  if (showTable) {
    return (
      <DataTable
        columns={['Day', 'Streak (days)', 'Reset']}
        rows={keys.map((k, i) => [fmtDay(k, 'short'), String(vals[i]), resets.includes(k) ? 'yes' : ''])}
      />
    )
  }

  const scale = niceScale(Math.max(...vals, 7), 3)
  const padL = 30, padR = 8, padT = 10, padB = 24
  const plotH = 140
  const H = plotH + padT + padB
  const plotW = width - padL - padR
  const band = plotW / Math.max(1, keys.length)
  const bw = Math.max(1.5, band - 1)
  const yOf = (v) => padT + plotH - (v / scale.max) * plotH
  const every = Math.max(1, Math.ceil(keys.length / Math.max(1, Math.floor(plotW / 56))))

  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Streak length over time">
      {scale.ticks.map((t) => {
        const y = Math.round(yOf(t)) + 0.5
        return (
          <g key={t}>
            <line className={t === 0 ? 'axis-line' : 'grid-line'} x1={padL} x2={width - padR} y1={y} y2={y} />
            <text className="axis-label" x={padL - 8} y={y + 3.5} textAnchor="end">{fmtNumber(t, 0)}</text>
          </g>
        )
      })}
      {keys.map((k, i) => {
        const v = vals[i]
        const isReset = resets.includes(k)
        return (
          <g key={k}>
            {v > 0 && (
              <path
                d={barPath(padL + i * band + (band - bw) / 2, yOf(v), bw, padT + plotH - yOf(v), true)}
                fill={isReset ? 'var(--critical)' : color}
                opacity={isReset ? 1 : 0.75}
              />
            )}
            <Hit
              x={padL + i * band}
              y={padT}
              w={band}
              h={plotH}
              label={fmtDay(k)}
              build={() => ({
                title: fmtDay(k),
                rows: [
                  { name: 'Streak', value: `${v} ${v === 1 ? 'day' : 'days'}`, color },
                  ...(isReset ? [{ name: 'Reset logged', value: 'yes', color: 'var(--critical)' }] : []),
                ],
              })}
            />
          </g>
        )
      })}
      {keys.map((k, i) =>
        i % every === 0 || i === keys.length - 1 ? (
          <text key={`x${k}`} className="axis-label" x={padL + i * band + band / 2} y={H - 7} textAnchor="middle">
            {fmtDay(k, 'short')}
          </text>
        ) : null
      )}
    </svg>
  )
}
