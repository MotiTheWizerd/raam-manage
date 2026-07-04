// Per-lobbyist high-score board for Space Invaders. Stored in localStorage on
// the (single, shared) lobby PC, so it doubles as the shared tournament board —
// everyone plays on the same machine. Keyed by the logged-in lobbyist's name,
// injected from the app; the game itself stays backend-agnostic.

export type ScoreEntry = {
  name: string
  score: number
  level: number
  at: number // epoch ms
}

const LB_KEY = 'space-invaders:leaderboard'
const MAX_ENTRIES = 20

export function cleanName(name?: string): string {
  return (name ?? '').trim() || 'אורח'
}

export function readLeaderboard(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(LB_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (e): e is ScoreEntry =>
          !!e && typeof e.name === 'string' && typeof e.score === 'number',
      )
      .map((e) => ({
        name: e.name,
        score: e.score,
        level: typeof e.level === 'number' ? e.level : 1,
        at: typeof e.at === 'number' ? e.at : 0,
      }))
      .sort((a, b) => b.score - a.score)
  } catch {
    return []
  }
}

// Record a run under the player's name, keeping only their personal best.
// Returns the refreshed board + whether this beat their previous best.
export function recordScore(
  name: string,
  score: number,
  level: number,
): { entries: ScoreEntry[]; isRecord: boolean } {
  const who = cleanName(name)
  const entries = readLeaderboard()
  if (score <= 0) return { entries, isRecord: false }

  const existing = entries.find((e) => e.name === who)
  if (existing && existing.score >= score) return { entries, isRecord: false }

  const next = entries.filter((e) => e.name !== who)
  next.push({ name: who, score, level, at: Date.now() })
  next.sort((a, b) => b.score - a.score)
  const capped = next.slice(0, MAX_ENTRIES)
  try {
    localStorage.setItem(LB_KEY, JSON.stringify(capped))
  } catch {}
  return { entries: capped, isRecord: true }
}
