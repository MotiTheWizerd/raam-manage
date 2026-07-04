export type GameEvent =
  | { type: 'invader-killed'; row: number; points: number }
  | { type: 'player-hit' }
  | { type: 'shield-hit' }
  | { type: 'march-step' }
  | { type: 'victory' }
  | { type: 'gameover' }
