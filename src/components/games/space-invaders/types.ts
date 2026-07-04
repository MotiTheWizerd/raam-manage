export const PLAY_W = 560
export const PLAY_H = 520

export const INV_COLS = 11
export const INV_ROWS = 5
export const INV_W = 24
export const INV_H = 16
export const INV_COL_GAP = 12   // gap between invader right edge and next left edge
export const INV_ROW_GAP = 16
export const INV_START_X = 28   // left edge of first invader, centered in play area
export const INV_START_Y = 60
export const INV_STEP_X = 8     // pixels per invader group step
export const INV_DROP_Y = 20    // pixels dropped when hitting a wall

export const PLAYER_W = 44
export const PLAYER_H = 20
export const PLAYER_Y = PLAY_H - 56
export const PLAYER_SPEED = 4

export const BULLET_W = 3
export const BULLET_H = 12
export const PLAYER_BULLET_SPEED = 10
export const ENEMY_BULLET_SPEED = 4

export const PLAYER_SHOOT_COOLDOWN = 18
export const ENEMY_SHOOT_BASE = 70

export type Invader = {
  id: number
  x: number
  y: number
  row: number
  alive: boolean
}

export type Bullet = {
  id: number
  x: number   // center x
  y: number   // top edge
  fromPlayer: boolean
}

export type InvaderDir = 1 | -1

export type GameStatus = 'playing' | 'paused' | 'gameover' | 'victory'

export type AnimFrame = 0 | 1

export type GameState = {
  playerX: number
  invaders: Invader[]
  bullets: Bullet[]
  invaderDir: InvaderDir
  invaderTickLeft: number
  score: number
  best: number
  lives: number
  status: GameStatus
  nextId: number
  playerShootCooldown: number
  enemyShootCooldown: number
  animFrame: AnimFrame
}
