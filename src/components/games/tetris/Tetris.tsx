import { useMemo } from 'react'
import { useTetris } from './useTetris'
import { PIECE_COLORS, getShape } from './pieces'
import type { Board, Cell } from './types'

function overlayPiece(board: Board, piece: ReturnType<typeof useTetris>['state']['current']): Board {
  const shape = getShape(piece.kind, piece.rotation)
  const next = board.map((row) => row.slice())
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (!shape[row][col]) continue
      const x = piece.x + col
      const y = piece.y + row
      if (y >= 0 && y < next.length && x >= 0 && x < next[0].length) {
        next[y][x] = piece.kind
      }
    }
  }
  return next
}

function cellClass(cell: Cell): string {
  if (!cell) return 'bg-zinc-900 border border-zinc-800/60'
  return `${PIECE_COLORS[cell]} border border-black/30 shadow-inner`
}

export function Tetris() {
  const { state, restart } = useTetris()
  const view = useMemo(
    () => (state.status === 'playing' ? overlayPiece(state.board, state.current) : state.board),
    [state.board, state.current, state.status],
  )
  const nextShape = getShape(state.next, 0)

  return (
    <div className="flex flex-col md:flex-row items-start gap-8 p-6">
      <div className="relative">
        <div
          className="grid gap-px bg-zinc-800 p-px rounded-md shadow-2xl"
          style={{ gridTemplateColumns: 'repeat(10, 1.5rem)' }}
        >
          {view.flatMap((row, y) =>
            row.map((cell, x) => (
              <div key={`${y}-${x}`} className={`h-6 w-6 ${cellClass(cell)}`} />
            )),
          )}
        </div>

        {state.status === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950/85 backdrop-blur-sm rounded-md">
            <div className="text-3xl font-bold text-red-400">GAME OVER</div>
            <div className="text-zinc-300">final score: {state.score}</div>
            <button
              onClick={restart}
              className="px-4 py-2 rounded-md bg-fuchsia-500 hover:bg-fuchsia-400 text-zinc-950 font-semibold transition"
            >
              play again (R)
            </button>
          </div>
        )}
      </div>

      <aside className="flex flex-col gap-4 text-zinc-200 font-mono">
        <Stat label="score" value={state.score} />
        <Stat label="lines" value={state.lines} />
        <Stat label="level" value={state.level} />

        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">next</div>
          <div
            className="grid gap-px bg-zinc-800 p-px rounded"
            style={{ gridTemplateColumns: `repeat(${nextShape[0].length}, 1.25rem)` }}
          >
            {nextShape.flatMap((row, y) =>
              row.map((on, x) => (
                <div
                  key={`n-${y}-${x}`}
                  className={`h-5 w-5 ${on ? PIECE_COLORS[state.next] : 'bg-zinc-900'}`}
                />
              )),
            )}
          </div>
        </div>

        <button
          onClick={restart}
          className="mt-2 px-3 py-1.5 rounded-md border border-zinc-700 hover:border-zinc-500 text-sm transition"
        >
          restart (R)
        </button>

        <div className="text-xs text-zinc-500 leading-relaxed mt-4 max-w-[14rem]">
          ← → move &nbsp;·&nbsp; ↓ soft drop<br />
          ↑ / X rotate &nbsp;·&nbsp; space hard drop<br />
          R restart
        </div>
      </aside>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="text-2xl tabular-nums">{value}</div>
    </div>
  )
}
