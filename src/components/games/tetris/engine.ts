import { BOARD_HEIGHT, BOARD_WIDTH, type Board, type Cell, type Piece, type PieceKind } from './types'
import { PIECE_SHAPES, getShape, randomPiece } from './pieces'

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, (): Cell => null),
  )
}

export function spawnPiece(kind: PieceKind): Piece {
  const shape = getShape(kind, 0)
  const width = shape[0].length
  return {
    kind,
    rotation: 0,
    x: Math.floor((BOARD_WIDTH - width) / 2),
    y: 0,
  }
}

export function collides(board: Board, piece: Piece): boolean {
  const shape = getShape(piece.kind, piece.rotation)
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (!shape[row][col]) continue
      const x = piece.x + col
      const y = piece.y + row
      if (x < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) return true
      if (y >= 0 && board[y][x]) return true
    }
  }
  return false
}

export function merge(board: Board, piece: Piece): Board {
  const shape = getShape(piece.kind, piece.rotation)
  const next = board.map((row) => row.slice())
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (!shape[row][col]) continue
      const x = piece.x + col
      const y = piece.y + row
      if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
        next[y][x] = piece.kind
      }
    }
  }
  return next
}

export function clearLines(board: Board): { board: Board; cleared: number } {
  const kept = board.filter((row) => row.some((cell) => cell === null))
  const cleared = BOARD_HEIGHT - kept.length
  const empty = Array.from({ length: cleared }, () =>
    Array.from({ length: BOARD_WIDTH }, (): Cell => null),
  )
  return { board: [...empty, ...kept], cleared }
}

export function rotated(piece: Piece, dir: 1 | -1): Piece {
  const variants = PIECE_SHAPES[piece.kind].length
  const rotation = (piece.rotation + dir + variants) % variants
  return { ...piece, rotation }
}

export function moved(piece: Piece, dx: number, dy: number): Piece {
  return { ...piece, x: piece.x + dx, y: piece.y + dy }
}

const LINE_SCORE = [0, 100, 300, 500, 800] as const

export function scoreForLines(cleared: number, level: number): number {
  const base = LINE_SCORE[cleared] ?? 0
  return base * level
}

export function levelFromLines(lines: number): number {
  return Math.floor(lines / 10) + 1
}

export function tickInterval(level: number): number {
  return Math.max(80, 800 - (level - 1) * 70)
}

export { randomPiece }
