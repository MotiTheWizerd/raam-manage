import { useCallback, useEffect, useReducer } from 'react'
import {
  clearLines,
  collides,
  emptyBoard,
  levelFromLines,
  merge,
  moved,
  randomPiece,
  rotated,
  scoreForLines,
  spawnPiece,
  tickInterval,
} from './engine'
import type { GameState } from './types'

type Action =
  | { type: 'tick' }
  | { type: 'move'; dx: number }
  | { type: 'soft-drop' }
  | { type: 'hard-drop' }
  | { type: 'rotate' }
  | { type: 'restart' }

function initialState(): GameState {
  return {
    board: emptyBoard(),
    current: spawnPiece(randomPiece()),
    next: randomPiece(),
    status: 'playing',
    score: 0,
    lines: 0,
    level: 1,
  }
}

function lockAndAdvance(state: GameState): GameState {
  const merged = merge(state.board, state.current)
  const { board, cleared } = clearLines(merged)
  const lines = state.lines + cleared
  const level = levelFromLines(lines)
  const score = state.score + scoreForLines(cleared, state.level)
  const nextPiece = spawnPiece(state.next)
  if (collides(board, nextPiece)) {
    return { ...state, board, score, lines, level, status: 'gameover' }
  }
  return {
    ...state,
    board,
    current: nextPiece,
    next: randomPiece(),
    score,
    lines,
    level,
  }
}

function reducer(state: GameState, action: Action): GameState {
  if (action.type === 'restart') return initialState()
  if (state.status !== 'playing') return state

  switch (action.type) {
    case 'tick':
    case 'soft-drop': {
      const moved1 = moved(state.current, 0, 1)
      if (!collides(state.board, moved1)) {
        const next = { ...state, current: moved1 }
        return action.type === 'soft-drop' ? { ...next, score: next.score + 1 } : next
      }
      return lockAndAdvance(state)
    }
    case 'move': {
      const candidate = moved(state.current, action.dx, 0)
      return collides(state.board, candidate) ? state : { ...state, current: candidate }
    }
    case 'rotate': {
      const candidate = rotated(state.current, 1)
      return collides(state.board, candidate) ? state : { ...state, current: candidate }
    }
    case 'hard-drop': {
      let piece = state.current
      let drop = 0
      while (!collides(state.board, moved(piece, 0, 1))) {
        piece = moved(piece, 0, 1)
        drop++
      }
      const dropped: GameState = { ...state, current: piece, score: state.score + drop * 2 }
      return lockAndAdvance(dropped)
    }
  }
}

export function useTetris() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  useEffect(() => {
    if (state.status !== 'playing') return
    const id = window.setInterval(() => dispatch({ type: 'tick' }), tickInterval(state.level))
    return () => window.clearInterval(id)
  }, [state.status, state.level])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          dispatch({ type: 'move', dx: -1 })
          break
        case 'ArrowRight':
          e.preventDefault()
          dispatch({ type: 'move', dx: 1 })
          break
        case 'ArrowDown':
          e.preventDefault()
          dispatch({ type: 'soft-drop' })
          break
        case 'ArrowUp':
        case 'x':
        case 'X':
          e.preventDefault()
          dispatch({ type: 'rotate' })
          break
        case ' ':
          e.preventDefault()
          dispatch({ type: 'hard-drop' })
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

  return { state, restart }
}
