import { useCallback, useEffect, useReducer } from 'react'
import { hits, OPPOSITE, outOfBounds, spawnFood, step, tickInterval } from './engine'
import { BOARD_SIZE, type Direction, type GameState } from './types'

const BEST_KEY = 'snake:best'

function readBest(): number {
  try {
    const raw = localStorage.getItem(BEST_KEY)
    return raw ? Number(raw) || 0 : 0
  } catch {
    return 0
  }
}

function writeBest(n: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(n))
  } catch {
    // ignore
  }
}

type Action =
  | { type: 'tick' }
  | { type: 'change-direction'; dir: Direction }
  | { type: 'toggle-pause' }
  | { type: 'restart' }

function initialState(best: number): GameState {
  const mid = Math.floor(BOARD_SIZE / 2)
  const snake = [
    { x: mid, y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
  ]
  return {
    snake,
    direction: 'right',
    nextDirection: 'right',
    food: spawnFood(snake),
    status: 'playing',
    score: 0,
    best,
  }
}

function reducer(state: GameState, action: Action): GameState {
  if (action.type === 'restart') return initialState(state.best)

  if (action.type === 'toggle-pause') {
    if (state.status === 'gameover') return state
    return { ...state, status: state.status === 'playing' ? 'paused' : 'playing' }
  }

  if (state.status !== 'playing') return state

  switch (action.type) {
    case 'change-direction': {
      if (action.dir === OPPOSITE[state.direction]) return state
      return { ...state, nextDirection: action.dir }
    }
    case 'tick': {
      const direction = state.nextDirection
      const head = step(state.snake[0], direction)

      if (outOfBounds(head)) {
        const best = Math.max(state.best, state.score)
        if (best !== state.best) writeBest(best)
        return { ...state, status: 'gameover', best }
      }

      const ateFood = head.x === state.food.x && head.y === state.food.y
      const bodyAfterMove = ateFood ? state.snake : state.snake.slice(0, -1)

      if (hits(head, bodyAfterMove)) {
        const best = Math.max(state.best, state.score)
        if (best !== state.best) writeBest(best)
        return { ...state, status: 'gameover', best }
      }

      const newSnake = [head, ...bodyAfterMove]
      return {
        ...state,
        snake: newSnake,
        direction,
        food: ateFood ? spawnFood(newSnake) : state.food,
        score: ateFood ? state.score + 10 : state.score,
      }
    }
  }
}

export function useSnake() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(readBest()))

  useEffect(() => {
    if (state.status !== 'playing') return
    const id = window.setInterval(() => dispatch({ type: 'tick' }), tickInterval(state.score))
    return () => window.clearInterval(id)
  }, [state.status, state.score])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          dispatch({ type: 'change-direction', dir: 'up' })
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          dispatch({ type: 'change-direction', dir: 'down' })
          break
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault()
          dispatch({ type: 'change-direction', dir: 'left' })
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault()
          dispatch({ type: 'change-direction', dir: 'right' })
          break
        case 'p':
        case 'P':
        case ' ':
          e.preventDefault()
          dispatch({ type: 'toggle-pause' })
          break
        case 'r':
        case 'R':
          dispatch({ type: 'restart' })
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const restart = useCallback(() => dispatch({ type: 'restart' }), [])
  const togglePause = useCallback(() => dispatch({ type: 'toggle-pause' }), [])

  return { state, restart, togglePause }
}
