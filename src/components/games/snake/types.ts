export const BOARD_SIZE = 20

export type Position = { x: number; y: number }

export type Direction = 'up' | 'down' | 'left' | 'right'

export type GameStatus = 'playing' | 'paused' | 'gameover'

export type GameState = {
  snake: Position[]
  direction: Direction
  nextDirection: Direction
  food: Position
  status: GameStatus
  score: number
  best: number
}
