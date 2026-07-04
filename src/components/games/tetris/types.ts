export const BOARD_WIDTH = 10
export const BOARD_HEIGHT = 20

export type PieceKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'

export type Cell = PieceKind | null

export type Board = Cell[][]

export type Piece = {
  kind: PieceKind
  rotation: number
  x: number
  y: number
}

export type GameStatus = 'idle' | 'playing' | 'gameover'

export type GameState = {
  board: Board
  current: Piece
  next: PieceKind
  status: GameStatus
  score: number
  lines: number
  level: number
}
