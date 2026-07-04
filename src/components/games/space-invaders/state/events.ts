import type { BonusKind } from './bonuses'

export type GameEvent =
  | { type: 'invader-killed'; row: number; points: number }
  | { type: 'player-hit' }
  | { type: 'shield-hit' }
  | { type: 'march-step' }
  | { type: 'bonus-collected'; kind: BonusKind }
  | { type: 'level-up'; stage: number }
  | { type: 'victory' }
  | { type: 'gameover' }
