// Generates the PWA / apple-touch-icon PNGs with no image deps:
// renders a supersampled bar-chart glyph and encodes RGBA8 via zlib.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2]
if (!OUT) throw new Error('usage: node make-icons.mjs <public-dir>')

const BG = [0x0b, 0x0d, 0x12]
// Ascending bars use the sequential blue ramp, so height and tone agree.
const BARS = [
  [0x18, 0x4f, 0x95], // step 600
  [0x25, 0x6a, 0xbf], // step 500
  [0x39, 0x87, 0xe5], // step 400
]

const inRoundRect = (px, py, x0, y0, x1, y1, r) => {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false
  const cx = Math.min(Math.max(px, x0 + r), x1 - r)
  const cy = Math.min(Math.max(py, y0 + r), y1 - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

/** Three ascending bars inside a safe zone, so the maskable crop can't clip them. */
function shapes(size, pad) {
  const inner = size - pad * 2
  const gap = inner * 0.1
  const w = (inner - gap * 2) / 3
  const r = w / 2
  const heights = [0.42, 0.68, 1.0]
  return heights.map((h, i) => {
    const x0 = pad + i * (w + gap)
    const barH = inner * h
    return { x0, y0: pad + inner - barH, x1: x0 + w, y1: pad + inner, r, fill: BARS[i] }
  })
}

function render(size, pad) {
  const px = Buffer.alloc(size * size * 4)
  const bars = shapes(size, pad)
  const S = 3 // supersample grid per axis
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const fx = x + (sx + 0.5) / S
          const fy = y + (sy + 0.5) / S
          let c = BG
          for (const bar of bars) {
            if (inRoundRect(fx, fy, bar.x0, bar.y0, bar.x1, bar.y1, bar.r)) {
              c = bar.fill
              break
            }
          }
          r += c[0]
          g += c[1]
          b += c[2]
        }
      }
      const n = S * S
      const o = (y * size + x) * 4
      px[o] = Math.round(r / n)
      px[o + 1] = Math.round(g / n)
      px[o + 2] = Math.round(b / n)
      px[o + 3] = 255
    }
  }
  return px
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour + alpha
  // Each scanline is prefixed with filter type 0 (none).
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Home-screen icons get generous padding (iOS/Android crop to a squircle);
// the maskable 512 needs the artwork inside the central 80%.
for (const [name, size, padRatio] of [
  ['icon-192.png', 192, 0.24],
  ['icon-512.png', 512, 0.24],
  ['icon-maskable-512.png', 512, 0.3],
  ['apple-touch-icon.png', 180, 0.22],
]) {
  const file = join(OUT, name)
  writeFileSync(file, png(size, render(size, Math.round(size * padRatio))))
  console.log('wrote', name, size)
}
