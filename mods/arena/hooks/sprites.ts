// Pixel critters on a 12 x 12 grid: a body, eyes, two leg poses and the gear
// a role wears. Drawn as an animated SVG on the desktop and as half-block
// cells in a terminal Raster. The same critters as agent-crew's, with arena
// gear: a red and a blue gladiator, and a crown for the variant kept.

export type Costume =
  | 'red'
  | 'blue'
  | 'champion'
  | 'captain'
  | 'explorer'
  | 'architect'
  | 'painter'
  | 'builder'
  | 'reviewer'
  | 'writer'
  | 'scientist'
  | 'helper'

export type Mood = 'active' | 'waiting' | 'resting' | 'pending' | 'done' | 'failed'

type Px = [x: number, y: number, color: string]

export const SIZE = 12

const BODY = '#d97757'
const LEGS = '#b55f43'
const EYES = '#1c1917'

function block(x: number, y: number, w: number, h: number, color: string): Px[] {
  const out: Px[] = []
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) out.push([x + dx, y + dy, color])
  }
  return out
}

const HELMET = (plume: string): Px[] => [
  ...block(4, 0, 4, 1, plume),
  ...block(3, 1, 6, 1, '#9ca3af'),
  ...block(2, 2, 8, 1, '#6b7280'),
]

const GEAR: Record<Costume, Px[]> = {
  red: [...HELMET('#dc2626'), ...block(11, 0, 1, 4, '#e5e7eb'), ...block(10, 4, 2, 1, '#a16207')],
  blue: [...HELMET('#2563eb'), ...block(10, 3, 2, 4, '#1d4ed8'), [10, 4, '#facc15'], [11, 5, '#facc15']],
  champion: [
    [3, 0, '#facc15'],
    [5, 0, '#facc15'],
    [6, 0, '#facc15'],
    [8, 0, '#facc15'],
    ...block(3, 1, 6, 1, '#eab308'),
    [5, 1, '#dc2626'],
    [6, 1, '#2563eb'],
    ...block(11, 0, 1, 2, '#facc15'),
    ...block(10, 2, 2, 1, '#eab308'),
    [11, 3, '#a16207'],
  ],
  captain: [
    ...block(4, 0, 4, 1, '#1e3a8a'),
    ...block(3, 1, 6, 1, '#1e3a8a'),
    ...block(2, 2, 8, 1, '#1e3a8a'),
    ...block(5, 1, 2, 1, '#facc15'),
  ],
  explorer: [
    ...block(4, 0, 4, 1, '#a3895b'),
    ...block(3, 1, 6, 1, '#7c6a46'),
    ...block(1, 2, 10, 1, '#a3895b'),
    ...block(10, 3, 2, 2, '#93c5fd'),
    [11, 5, '#78350f'],
  ],
  architect: [
    [0, 2, '#f9a8d4'],
    ...block(0, 3, 1, 2, '#facc15'),
    ...block(10, 1, 2, 4, '#2563eb'),
    [10, 2, '#e0f2fe'],
    [11, 3, '#e0f2fe'],
  ],
  painter: [
    [5, 0, '#991b1b'],
    ...block(3, 1, 5, 1, '#dc2626'),
    ...block(2, 2, 7, 1, '#dc2626'),
    [11, 1, '#3b82f6'],
    ...block(11, 2, 1, 3, '#92400e'),
    [10, 0, '#facc15'],
  ],
  builder: [
    ...block(4, 0, 4, 1, '#facc15'),
    ...block(3, 1, 6, 1, '#facc15'),
    ...block(1, 2, 10, 1, '#eab308'),
    ...block(10, 1, 2, 1, '#9ca3af'),
    ...block(11, 2, 1, 3, '#6b7280'),
  ],
  reviewer: [
    [5, 0, '#78350f'],
    ...block(4, 1, 4, 1, '#a16207'),
    ...block(3, 2, 6, 1, '#854d0e'),
    [4, 2, '#a16207'],
    [6, 2, '#a16207'],
    [8, 2, '#a16207'],
    [2, 3, '#854d0e'],
    [9, 3, '#854d0e'],
    ...block(10, 2, 2, 4, '#92400e'),
    [10, 3, '#f9fafb'],
    [11, 4, '#22c55e'],
  ],
  writer: [
    [11, 0, '#f3f4f6'],
    ...block(10, 1, 2, 1, '#e5e7eb'),
    [10, 2, '#f3f4f6'],
    [10, 3, '#9ca3af'],
    [10, 4, '#111827'],
  ],
  scientist: [
    ...block(2, 4, 8, 1, '#0891b2'),
    [10, 2, '#d1d5db'],
    ...block(10, 3, 2, 2, '#22c55e'),
    [11, 3, '#86efac'],
  ],
  helper: [
    [6, 1, '#16a34a'],
    [5, 2, '#22c55e'],
    [6, 2, '#16a34a'],
  ],
}

function gray(color: string): string {
  const n = parseInt(color.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const v = Math.round(0.3 * r + 0.59 * g + 0.11 * b)
  const mixed = Math.round(v * 0.6 + 160 * 0.4)
  const hex = mixed.toString(16).padStart(2, '0')
  return `#${hex}${hex}${hex}`
}

type Parts = { body: Px[]; eyes: Px[]; legsA: Px[]; legsB: Px[]; gear: Px[] }

function parts(costume: Costume, mood: Mood): Parts {
  const isGray = mood === 'done' || mood === 'pending'
  const body = mood === 'failed' ? '#b45454' : isGray ? gray(BODY) : BODY
  const legs = mood === 'failed' ? '#8f3f3f' : isGray ? gray(LEGS) : LEGS
  const tint = (px: Px[]): Px[] =>
    isGray ? px.map(([x, y, c]) => [x, y, gray(c)] as Px) : px

  const eyes: Px[] =
    mood === 'failed'
      ? [2, 7].flatMap(x => [
          [x, 4, EYES],
          [x + 2, 4, EYES],
          [x + 1, 5, EYES],
          [x, 6, EYES],
          [x + 2, 6, EYES],
        ] as Px[])
      : mood === 'resting' || mood === 'done'
        ? [[4, 5, EYES], [7, 5, EYES]]
        : [...block(4, 4, 1, 2, EYES), ...block(7, 4, 1, 2, EYES)]

  return {
    body: [
      ...block(2, 3, 8, 6, body),
      ...block(0, 5, 2, 2, body),
      ...block(10, 5, 2, 2, body),
    ],
    eyes,
    legsA: [
      ...block(2, 9, 1, 2, legs),
      ...block(7, 9, 1, 2, legs),
      [4, 9, legs],
      [9, 9, legs],
    ],
    legsB: [
      ...block(4, 9, 1, 2, legs),
      ...block(9, 9, 1, 2, legs),
      [2, 9, legs],
      [7, 9, legs],
    ],
    gear: tint(GEAR[costume]),
  }
}

/** Rects for a list of pixels, merging horizontal runs of one color. */
function rects(px: Px[]): string {
  const sorted = [...px].sort((a, b) => a[1] - b[1] || a[0] - b[0])
  let out = ''
  let i = 0
  for (;;) {
    const first = sorted[i]
    if (first === undefined) break
    const [x, y, c] = first
    let w = 1
    for (;;) {
      const nextPx = sorted[i + w]
      if (nextPx === undefined || nextPx[1] !== y || nextPx[0] !== x + w || nextPx[2] !== c) break
      w++
    }
    out += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"/>`
    i += w
  }
  return out
}

export function spriteSvg(costume: Costume, mood: Mood): string {
  const p = parts(costume, mood)
  const opacity = mood === 'pending' ? ' opacity="0.55"' : ''
  const isActive = mood === 'active'
  const step = '0.7s'
  const bob = isActive
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -0.6;0 0" dur="${step}" repeatCount="indefinite"/>`
    : ''
  const legsA = isActive
    ? `<g>${rects(p.legsA)}<animate attributeName="opacity" values="1;0" dur="${step}" calcMode="discrete" repeatCount="indefinite"/></g>`
    : rects(p.legsA)
  const legsB = isActive
    ? `<g opacity="0">${rects(p.legsB)}<animate attributeName="opacity" values="0;1" dur="${step}" calcMode="discrete" repeatCount="indefinite"/></g>`
    : ''
  const blink =
    mood === 'active' || mood === 'waiting'
      ? `<animate attributeName="opacity" values="1;1;0;1" keyTimes="0;0.92;0.96;1" dur="${mood === 'waiting' ? '2.4s' : '3.6s'}" repeatCount="indefinite"/>`
      : ''
  const thinking =
    mood === 'waiting'
      ? `<g fill="#a8a29e">${[0, 1, 2]
          .map(
            n =>
              `<rect x="${4 + n * 2}" y="-1" width="1" height="1"><animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="${n * 0.3}s" repeatCount="indefinite"/></rect>`,
          )
          .join('')}</g>`
      : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -1 ${SIZE} ${SIZE + 1}" shape-rendering="crispEdges"${opacity}>` +
    thinking +
    legsA +
    legsB +
    `<g>${bob}${rects(p.body)}<g>${blink}${rects(p.eyes)}</g>${rects(p.gear)}</g>` +
    `</svg>`
  )
}

const DEFAULT_COLOR = 0x01000000

function rgb(color: string | undefined): number {
  return color === undefined ? DEFAULT_COLOR : parseInt(color.slice(1), 16)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63)
    out += i + 1 < bytes.length ? B64.charAt((n >> 6) & 63) : '='
    out += i + 2 < bytes.length ? B64.charAt(n & 63) : '='
  }
  return out
}

/**
 * Cells for a terminal Raster, SIZE columns by SIZE / 2 rows: each cell is two
 * pixels stacked with the half-block glyphs. `frame` alternates the legs.
 */
export function spriteCells(costume: Costume, mood: Mood, frame: number): string {
  const p = parts(costume, mood)
  const isActive = mood === 'active'
  const legs = isActive && frame % 2 === 1 ? p.legsB : p.legsA
  const shut = mood === 'waiting' && frame % 4 === 3
  const eyes = shut ? p.eyes.filter(([, y]) => y === 5) : p.eyes
  const grid: (string | undefined)[][] = Array.from({ length: SIZE }, () =>
    Array<string | undefined>(SIZE).fill(undefined),
  )
  for (const [x, y, c] of [...legs, ...p.body, ...eyes, ...p.gear]) {
    const line = grid[y]
    if (line !== undefined && x >= 0 && x < SIZE) line[x] = c
  }

  const rows = SIZE / 2
  const words = new Uint32Array(SIZE * rows * 3)
  let w = 0
  for (let row = 0; row < rows; row++) {
    for (let x = 0; x < SIZE; x++) {
      const top = grid[row * 2]?.[x]
      const bottom = grid[row * 2 + 1]?.[x]
      if (top === undefined && bottom === undefined) {
        words.set([0x20, DEFAULT_COLOR, DEFAULT_COLOR], w)
      } else if (top === undefined) {
        words.set([0x2584, rgb(bottom), DEFAULT_COLOR], w)
      } else {
        words.set([0x2580, rgb(top), rgb(bottom)], w)
      }
      w += 3
    }
  }

  return base64(new Uint8Array(words.buffer))
}
