// Unreal-Tournament-style multi-kill announcer. Kill invaders by SHOOTING in
// quick succession — each kill within COMBO_GAP of the last grows the combo;
// let it lapse (or take a hit) and it resets. Crossing a tier fires a callout.

const TICK_MS = 16 // matches the game loop (see useGameLoop)
const ticks = (sec: number) => Math.round((sec * 1000) / TICK_MS)

// Keep the chain alive only if you kill again within this short gap — you have
// to keep the pressure on. Tunable: looser = more callouts, tighter = a feat.
export const COMBO_GAP_TICKS = ticks(0.5)
// How long a callout stays on screen.
export const ANNOUNCE_TICKS = ticks(1.3)

export type KillTier = {
  at: number // combo count that triggers it
  label: string
  glyph: string
  color: string
}

// The whole ladder — ordered by `at`. Rename / retune freely.
export const KILL_TIERS: KillTier[] = [
  { at: 2, label: 'DOUBLE KILL', glyph: '💥', color: '#38bdf8' }, // sky
  { at: 3, label: 'HAT TRICK', glyph: '🎩', color: '#34d399' }, // emerald
  { at: 5, label: 'EXCELLENT', glyph: '⭐', color: '#a78bfa' }, // violet
  { at: 7, label: 'RAMPAGE', glyph: '🔥', color: '#fb923c' }, // orange
  { at: 10, label: 'MONSTER KILL', glyph: '👹', color: '#f43f5e' }, // rose
  { at: 15, label: 'GODLIKE', glyph: '⚡', color: '#fbbf24' }, // amber
  { at: 20, label: 'WICKED SICK', glyph: '💀', color: '#f472b6' }, // pink
]

export type Announcement = { label: string; glyph: string; color: string }

// The top tier newly crossed as the combo grew from `prev` to `now` (or null).
// Handles jumps bigger than 1 (e.g. Triple Shot downing several at once).
export function tierCrossed(prev: number, now: number): KillTier | null {
  let hit: KillTier | null = null
  for (const t of KILL_TIERS) {
    if (t.at > prev && t.at <= now) hit = t // keep climbing to the highest match
  }
  return hit
}
