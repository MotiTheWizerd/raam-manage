import { useEffect, type Dispatch } from 'react'
import type { GameStatus } from '../types'
import type { Action, Keys } from './reducer'

const TICK_MS = 16

export function useGameLoop(
  status: GameStatus,
  keysRef: { current: Keys },
  dispatch: Dispatch<Action>,
) {
  useEffect(() => {
    if (status !== 'playing') return
    const id = window.setInterval(
      () => dispatch({ type: 'tick', keys: { ...keysRef.current } }),
      TICK_MS,
    )
    return () => window.clearInterval(id)
  }, [status, keysRef, dispatch])
}
