import {
  BULLET_H,
  BULLET_W,
  INV_H,
  INV_W,
  PLAY_W,
  type Bullet,
  type Invader,
} from './types'

export const SHIELD_CELLS_W = 14
export const SHIELD_CELLS_H = 12
export const SHIELD_PIXEL = 5
export const SHIELD_W = SHIELD_CELLS_W * SHIELD_PIXEL
export const SHIELD_H = SHIELD_CELLS_H * SHIELD_PIXEL
export const SHIELD_Y = 390
export const SHIELD_BLAST = 2
export const SHIELD_RAGGED = 0.6
export const SHIELD_COLOR = '#fbbf24'

// רעם reads right-to-left, so on-screen order left→right is ם, ע, ר
const MEM = [
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  'XXX........XXX',
  'XXX........XXX',
  'XXX........XXX',
  'XXX........XXX',
  'XXX........XXX',
  'XXX........XXX',
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
]

const AYIN = [
  'XXX.........XX',
  'XXX........XXX',
  'XXX........XXX',
  '.XXX.......XXX',
  '.XXX......XXX.',
  '..XXX.....XXX.',
  '..XXX....XXX..',
  '...XXX..XXX...',
  '...XXXXXXX....',
  '..XXXXXXX.....',
  '.XXXX.........',
  'XXXX..........',
]

const RESH = [
  'XXXXXXXXXXXX..',
  'XXXXXXXXXXXXX.',
  'XXXXXXXXXXXXXX',
  '...........XXX',
  '...........XXX',
  '...........XXX',
  '...........XXX',
  '...........XXX',
  '...........XXX',
  '...........XXX',
  '...........XXX',
  '...........XXX',
]

const LETTER_ORDER = [MEM, AYIN, RESH]

export type Shield = {
  x: number
  y: number
  cells: boolean[][]
}

export function createShields(): Shield[] {
  const gap = Math.round((PLAY_W - 3 * SHIELD_W) / 4)
  return LETTER_ORDER.map((grid, i) => ({
    x: gap + i * (SHIELD_W + gap),
    y: SHIELD_Y,
    cells: grid.map((row) => [...row].map((ch) => ch === 'X')),
  }))
}

function erode(cells: boolean[][], cr: number, cc: number): boolean[][] {
  const R = SHIELD_BLAST
  const reach = Math.ceil(R)
  const next = cells.map((row) => [...row])
  for (let dr = -reach; dr <= reach; dr++) {
    for (let dc = -reach; dc <= reach; dc++) {
      const r = cr + dr
      const c = cc + dc
      if (r < 0 || r >= SHIELD_CELLS_H || c < 0 || c >= SHIELD_CELLS_W) continue
      const d = Math.sqrt(dr * dr + dc * dc)
      if (d > R) continue
      const edge = d / R
      const pRagged = edge < 0.55 ? 1 : Math.max(0, 1 - (edge - 0.55) / 0.45)
      const p = 1 + (pRagged - 1) * SHIELD_RAGGED
      if (Math.random() < p) next[r][c] = false
    }
  }
  return next
}

export function resolveShieldHits(
  bullets: Bullet[],
  shields: Shield[],
): { bullets: Bullet[]; shields: Shield[]; hits: number } {
  let hits = 0
  const nextShields = [...shields]
  const surviving: Bullet[] = []

  for (const b of bullets) {
    const bL = b.x - BULLET_W / 2
    const bR = b.x + BULLET_W / 2
    const bT = b.y
    const bB = b.y + BULLET_H
    let absorbed = false

    for (let si = 0; si < nextShields.length && !absorbed; si++) {
      const s = nextShields[si]
      if (bR <= s.x || bL >= s.x + SHIELD_W || bB <= s.y || bT >= s.y + SHIELD_H) continue

      const c0 = Math.max(0, Math.floor((bL - s.x) / SHIELD_PIXEL))
      const c1 = Math.min(SHIELD_CELLS_W - 1, Math.floor((bR - s.x) / SHIELD_PIXEL))
      const r0 = Math.max(0, Math.floor((bT - s.y) / SHIELD_PIXEL))
      const r1 = Math.min(SHIELD_CELLS_H - 1, Math.floor((bB - s.y) / SHIELD_PIXEL))

      // impact at the bullet's leading edge: bottom-up for player shots, top-down for enemy
      const rows: number[] = []
      if (b.fromPlayer) for (let r = r1; r >= r0; r--) rows.push(r)
      else for (let r = r0; r <= r1; r++) rows.push(r)

      outer: for (const r of rows) {
        for (let c = c0; c <= c1; c++) {
          if (s.cells[r][c]) {
            nextShields[si] = { ...s, cells: erode(s.cells, r, c) }
            absorbed = true
            hits++
            break outer
          }
        }
      }
    }

    if (!absorbed) surviving.push(b)
  }

  return { bullets: surviving, shields: nextShields, hits }
}

export function anyInvaderInShieldZone(invaders: Invader[]): boolean {
  return invaders.some((inv) => inv.alive && inv.y + INV_H >= SHIELD_Y)
}

export function stompShields(invaders: Invader[], shields: Shield[]): Shield[] {
  let changed = false
  const next = shields.map((s) => {
    let cells: boolean[][] | null = null
    for (const inv of invaders) {
      if (!inv.alive) continue
      if (inv.x + INV_W <= s.x || inv.x >= s.x + SHIELD_W) continue
      if (inv.y + INV_H <= s.y || inv.y >= s.y + SHIELD_H) continue

      const c0 = Math.max(0, Math.floor((inv.x - s.x) / SHIELD_PIXEL))
      const c1 = Math.min(SHIELD_CELLS_W - 1, Math.floor((inv.x + INV_W - s.x) / SHIELD_PIXEL))
      const r0 = Math.max(0, Math.floor((inv.y - s.y) / SHIELD_PIXEL))
      const r1 = Math.min(SHIELD_CELLS_H - 1, Math.floor((inv.y + INV_H - s.y) / SHIELD_PIXEL))

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (cells ? cells[r][c] : s.cells[r][c]) {
            if (!cells) cells = s.cells.map((row) => [...row])
            cells[r][c] = false
            changed = true
          }
        }
      }
    }
    return cells ? { ...s, cells } : s
  })
  return changed ? next : shields
}
