import { useCallback, useReducer } from 'react'
import { readBest } from './bestScore'
import { initialState, reducer } from './reducer'
import { useGameLoop } from './useGameLoop'
import { useKeyboard } from './useKeyboard'

export function useSpaceInvaders() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(readBest()))
  const keysRef = useKeyboard(dispatch)
  useGameLoop(state.status, keysRef, dispatch)

  const restart = useCallback(() => dispatch({ type: 'restart' }), [])
  const togglePause = useCallback(() => dispatch({ type: 'toggle-pause' }), [])

  return { state, restart, togglePause }
}
