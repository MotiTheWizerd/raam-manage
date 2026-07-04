import { useEffect, useRef, type Dispatch } from 'react'
import type { Action, Keys } from './reducer'

export function useKeyboard(dispatch: Dispatch<Action>) {
  const keysRef = useRef<Keys>({ left: false, right: false, shoot: false })

  useEffect(() => {
    const handle = (e: KeyboardEvent, down: boolean) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault()
          keysRef.current.left = down
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault()
          keysRef.current.right = down
          break
        case ' ':
        case 'ArrowUp':
          e.preventDefault()
          keysRef.current.shoot = down
          break
        case 'p':
        case 'P':
          if (down) dispatch({ type: 'toggle-pause' })
          break
        case 'r':
        case 'R':
          if (down) dispatch({ type: 'restart' })
          break
      }
    }
    const onDown = (e: KeyboardEvent) => handle(e, true)
    const onUp = (e: KeyboardEvent) => handle(e, false)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [dispatch])

  return keysRef
}
