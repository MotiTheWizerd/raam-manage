import { BOARD_SIZE, type Direction, type Position } from './types'

const DELTA: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

export function step(head: Position, dir: Direction): Position {
  const d = DELTA[dir]
  return { x: head.x + d.x, y: head.y + d.y }
}

export function outOfBounds(p: Position): boolean {
  return p.x < 0 || p.x >= BOARD_SIZE || p.y < 0 || p.y >= BOARD_SIZE
}

export function hits(p: Position, snake: ReadonlyArray<Position>): boolean {
  return snake.some((s) => s.x === p.x && s.y === p.y)
}

export function spawnFood(snake: ReadonlyArray<Position>): Position {
  const occupied = new Set(snake.map((s) => `${s.x},${s.y}`))
  const empty: Position[] = []
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (!occupied.has(`${x},${y}`)) empty.push({ x, y })
    }
  }
  if (empty.length === 0) return snake[0]
  return empty[Math.floor(Math.random() * empty.length)]
}

export function tickInterval(score: number): number {
  return Math.max(60, 140 - Math.floor(score / 10) * 5)
}
