import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { Card, Button } from './ui'
import { useApp } from '../lib/store'
import { evaluate, badgeKey, score, TIERS } from '../lib/achievements'
import * as notify from '../lib/notify'

export default function Achievements() {
  const { active, entries, plans, settings, setSetting, flash } = useApp()
  const [showAll, setShowAll] = useState(false)
  const announced = useRef(false)

  const list = useMemo(
    () => evaluate({ sections: active, entries, plans }),
    [active, entries, plans]
  )

  const earned = list.filter((a) => a.earned)
  const total = score(list)

  /* Tell you the moment a tier lands, once, and never again. The set of
     keys already seen lives in settings, so it survives a reload and
     follows you across devices. */
  useEffect(() => {
    if (announced.current || !list.length) return
    const seen = new Set(settings.badgesSeen ?? [])
    const fresh = earned.filter((a) => !seen.has(badgeKey(a)))
    if (!fresh.length) {
      /* first run on a device with history: record without shouting */
      if (!settings.badgesSeen && earned.length) {
        setSetting('badgesSeen', earned.map(badgeKey))
      }
      return
    }
    announced.current = true
    const top = fresh[0]
    flash(`${top.tierName} unlocked — ${top.name} (${top.value} ${top.unit})`)
    notify.fire(`badge:${badgeKey(top)}`, `${top.tierName}: ${top.name}`, `${top.value} ${top.unit}. ${top.blurb}`)
    notify.buzz([60, 40, 60, 40, 120])
    setSetting('badgesSeen', [...seen, ...fresh.map(badgeKey)])
  }, [list, earned, settings.badgesSeen, setSetting, flash])

  const shown = showAll ? list : list.slice(0, 6)

  return (
    <Card
      title="Achievements"
      sub={`${earned.length} of ${list.length} unlocked · ${total} points`}
      tools={
        list.length > 6 ? (
          <Button size="sm" tone="ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Fewer' : 'All'}
          </Button>
        ) : null
      }
      className="mb-3.5"
    >
      <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
        {shown.map((a) => (
          <div
            key={a.id}
            className="relative overflow-hidden rounded-[14px] border p-3"
            style={{
              borderColor: a.earned ? `color-mix(in oklab, ${a.colour} 45%, var(--line))` : 'var(--line)',
              background: a.earned
                ? `linear-gradient(135deg, color-mix(in oklab, ${a.colour} 13%, var(--surface)), var(--surface) 72%)`
                : 'var(--surface)',
            }}
          >
            <div className="flex items-start gap-2.5">
              <span
                className="w-8 h-8 rounded-[10px] grid place-items-center shrink-0"
                style={{
                  background: a.earned ? `color-mix(in oklab, ${a.colour} 22%, transparent)` : 'var(--surface-2)',
                  color: a.earned ? a.colour : 'var(--ink-3)',
                }}
              >
                <Icon name={a.icon} size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[13px] font-semibold truncate">{a.name}</span>
                  {a.tierName && (
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: a.colour }}>
                      {a.tierName}
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-ink-3 mt-0.5 leading-snug">{a.blurb}</div>
              </div>
            </div>

            <div className="mt-2.5">
              <div className="flex items-baseline justify-between text-[11.5px] mb-1">
                <span className="num font-semibold">{a.value} {a.unit}</span>
                <span className="text-ink-3 num">
                  {a.next ? `next at ${a.next}` : 'maxed'}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.round(a.progress * 100)}%`,
                    background: a.earned ? a.colour : 'var(--ink-3)',
                  }}
                />
              </div>
              {/* four pips, one per tier, so the ladder is visible */}
              <div className="flex gap-1 mt-1.5">
                {TIERS.map((tier, i) => (
                  <span
                    key={tier.id}
                    title={tier.name}
                    className="h-1 flex-1 rounded-full"
                    style={{ background: i <= a.tier ? tier.colour : 'var(--surface-3)' }}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11.5px] text-ink-3 mt-3">
        Every one is computed from your own entries, so nothing can be awarded by accident — and nothing can be
        claimed without doing it.
      </p>
    </Card>
  )
}
