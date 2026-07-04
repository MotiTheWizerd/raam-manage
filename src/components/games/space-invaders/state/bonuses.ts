import {
  INV_H,
  INV_W,
  PLAY_H,
  PLAYER_H,
  PLAYER_W,
  PLAYER_Y,
} from '../types'

// The game loop ticks every 16ms (see useGameLoop). seconds -> ticks.
const TICK_MS = 16
const ticks = (sec: number) => Math.round((sec * 1000) / TICK_MS)

// --- Bonus kinds + registry ------------------------------------------------
// A bonus is data: its falling-box visual + how long its effect lasts. The
// effect itself is applied by the reducer (switch on kind), since it touches
// game state. To add a bonus: add a kind here + its case in the reducer.

export type BonusKind = 'shield' | 'rapidFire'

export type BonusMeta = {
  kind: BonusKind
  label: string
  glyph: string // shown on the falling box + the HUD chip
  color: string // box + effect accent color
  duration: number // effect length in ticks; 0 = instant
}

export const BONUSES: Record<BonusKind, BonusMeta> = {
  shield: {
    kind: 'shield',
    label: 'Force Field',
    glyph: '🛡️',
    color: '#38bdf8', // sky-400
    duration: ticks(10), // 10 seconds of invulnerability
  },
  rapidFire: {
    kind: 'rapidFire',
    label: 'Rapid Fire',
    glyph: '🔥',
    color: '#fb923c', // orange-400
    duration: ticks(8), // 8 seconds of fast shooting
  },
}

// --- Active timed effects: kind -> ticks remaining -------------------------

export type ActiveEffects = Partial<Record<BonusKind, number>>

export function tickEffects(effects: ActiveEffects): ActiveEffects {
  const keys = Object.keys(effects) as BonusKind[]
  if (keys.length === 0) return effects
  const next: ActiveEffects = {}
  for (const k of keys) {
    const left = (effects[k] ?? 0) - 1
    if (left > 0) next[k] = left
  }
  return next
}

// --- Falling bonus entity --------------------------------------------------

export type Bonus = {
  id: number
  x: number // center x
  y: number // top edge
  kind: BonusKind
}

export const BONUS_W = 18
export const BONUS_H = 18
export const BONUS_FALL_SPEED = 2.2

// Chance a killed invader drops a bonus. Tunable — bump it while testing.
export const DROP_CHANCE = 0.2

// Which bonus kinds may drop on a given stage. Data-driven so each stage can
// bring its own set once stages exist. Placeholder: every stage drops shield.
export function stageBonusPool(stage: number): BonusKind[] {
  return stage >= 1 ? ['shield', 'rapidFire'] : []
}

// Roll the drop for a killed invader; on a hit, spawn a bonus at its center,
// picking a kind from the current stage's pool.
export function maybeDropBonus(
  invX: number,
  invY: number,
  stage: number,
  id: number
): Bonus | null {
  if (Math.random() >= DROP_CHANCE) return null
  const pool = stageBonusPool(stage)
  if (pool.length === 0) return null
  const kind = pool[Math.floor(Math.random() * pool.length)]
  return { id, x: invX + INV_W / 2, y: invY + INV_H / 2, kind }
}

// Fall one tick; drop anything that fell off the bottom.
export function stepBonuses(bonuses: Bonus[]): Bonus[] {
  if (bonuses.length === 0) return bonuses
  const next: Bonus[] = []
  for (const b of bonuses) {
    const y = b.y + BONUS_FALL_SPEED
    if (y > PLAY_H) continue
    next.push({ ...b, y })
  }
  return next
}

// Split the falling bonuses into the ones the ship is touching and the rest.
export function catchBonuses(
  bonuses: Bonus[],
  playerX: number
): { remaining: Bonus[]; caught: Bonus[] } {
  if (bonuses.length === 0) return { remaining: bonuses, caught: [] }
  const remaining: Bonus[] = []
  const caught: Bonus[] = []
  const px1 = playerX
  const px2 = playerX + PLAYER_W
  const py1 = PLAYER_Y
  const py2 = PLAYER_Y + PLAYER_H
  for (const b of bonuses) {
    const bx1 = b.x - BONUS_W / 2
    const bx2 = b.x + BONUS_W / 2
    const overlaps = bx1 < px2 && bx2 > px1 && b.y < py2 && b.y + BONUS_H > py1
    if (overlaps) caught.push(b)
    else remaining.push(b)
  }
  return { remaining, caught }
}
