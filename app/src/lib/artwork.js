/* Section artwork — generated, not bundled.
 *
 * Every section gets its own backdrop, derived from its id and palette
 * slot. Because it is computed rather than looked up, a tracker you invent
 * five minutes from now gets artwork automatically — nothing to download,
 * nothing to store, nothing that can go missing on another device.
 *
 * Deliberately abstract. I am not shipping anime art I do not have the
 * rights to; if you want your own images, that is an upload feature with
 * blob storage, not a hardcoded folder.
 */

/* a small deterministic hash, so the same id always yields the same art */
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

const PATTERNS = ['rays', 'orbit', 'peaks', 'grid', 'bloom']

/** { css, pattern } — a background for a tile, keyed to the section */
export function artFor(section) {
  const tint = `var(--s${section.slot ?? 1})`
  const a = hash(section.id)
  const b = hash(`${section.id}:b`)
  const angle = Math.round(a * 360)
  const pattern = PATTERNS[Math.floor(b * PATTERNS.length)]

  /* two washes plus a soft highlight — enough depth to feel deliberate,
     faint enough that the numbers on top stay the loudest thing */
  const css = [
    `radial-gradient(120% 90% at ${Math.round(12 + a * 70)}% ${Math.round(6 + b * 24)}%,`
      + ` color-mix(in oklab, ${tint} 22%, transparent), transparent 62%)`,
    `linear-gradient(${angle}deg, color-mix(in oklab, ${tint} 9%, transparent), transparent 58%)`,
  ].join(', ')

  return { css, pattern, tint, seed: a }
}

/** the decorative SVG layer that sits under a tile's content */
export function artPath(pattern, seed) {
  const j = (n) => Math.round(n)
  switch (pattern) {
    case 'rays':
      return Array.from({ length: 7 }, (_, i) => {
        const x = j(10 + i * 16 + seed * 10)
        return `M${x} 100 L${j(x + 22 + seed * 10)} 0`
      }).join(' ')
    case 'orbit':
      return Array.from({ length: 4 }, (_, i) => {
        const r = 18 + i * 15
        return `M${j(78 - r)} 40 a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`
      }).join(' ')
    case 'peaks':
      return `M0 96 L${j(18 + seed * 8)} ${j(48 + seed * 16)} L${j(40 + seed * 6)} 78 L${j(64 + seed * 8)} ${j(30 + seed * 20)} L100 84`
    case 'grid':
      return Array.from({ length: 6 }, (_, i) => `M0 ${j(14 + i * 16)} H100`).join(' ')
                .concat(' ', Array.from({ length: 5 }, (_, i) => `M${j(16 + i * 18)} 0 V100`).join(' '))
    default: /* bloom */
      return Array.from({ length: 6 }, (_, i) => {
        const t = (i / 6) * Math.PI * 2 + seed * 3
        return `M50 50 L${j(50 + Math.cos(t) * 46)} ${j(50 + Math.sin(t) * 40)}`
      }).join(' ')
  }
}
