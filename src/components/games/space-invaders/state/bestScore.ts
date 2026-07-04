const BEST_KEY = 'space-invaders:best'

export function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

export function writeBest(n: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(n))
  } catch {}
}
