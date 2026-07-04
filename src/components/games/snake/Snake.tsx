import { useMemo } from 'react'
import { useSnake } from './useSnake'
import { BOARD_SIZE, type GameState } from './types'

type CellKind = 'head' | 'body' | 'food' | null

function buildGrid(state: GameState): CellKind[][] {
  const grid: CellKind[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, (): CellKind => null),
  )
  state.snake.forEach((seg, i) => {
    grid[seg.y][seg.x] = i === 0 ? 'head' : 'body'
  })
  grid[state.food.y][state.food.x] = 'food'
  return grid
}

function cellClass(kind: CellKind): string {
  switch (kind) {
    case 'head':
      return 'bg-emerald-300 ring-1 ring-emerald-200/60'
    case 'body':
      return 'bg-emerald-500'
    case 'food':
      return 'bg-red-500 animate-pulse'
    default:
      return 'bg-zinc-900 border border-zinc-800/40'
  }
}

export function Snake() {
  const { state, restart, togglePause } = useSnake()
  const grid = useMemo(() => buildGrid(state), [state])

  return (
    <div className="flex flex-col md:flex-row items-start gap-8 p-6">
      <div className="relative">
        <div
          className="grid gap-px bg-zinc-800 p-px rounded-md shadow-2xl"
          style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 1.25rem)` }}
        >
          {grid.flatMap((row, y) =>
            row.map((cell, x) => (
              <div key={`${y}-${x}`} className={`h-5 w-5 ${cellClass(cell)}`} />
            )),
          )}
        </div>

        {state.status === 'paused' && (
          <Overlay tone="zinc">
            <div className="text-3xl font-bold text-zinc-200">PAUSED</div>
            <button
              onClick={togglePause}
              className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold transition"
            >
              resume (P)
            </button>
          </Overlay>
        )}

        {state.status === 'gameover' && (
          <Overlay tone="red">
            <div className="text-3xl font-bold text-red-400">GAME OVER</div>
            <div className="text-zinc-300">final score: {state.score}</div>
            {state.score === state.best && state.best > 0 && (
              <div className="text-amber-300 text-sm">★ new best ★</div>
            )}
            <button
              onClick={restart}
              className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold transition"
            >
              play again (R)
            </button>
          </Overlay>
        )}
      </div>

      <aside className="flex flex-col gap-4 text-zinc-200 font-mono">
        <Stat label="score" value={state.score} />
        <Stat label="best" value={state.best} />
        <Stat label="length" value={state.snake.length} />

        <div className="flex gap-2 mt-2">
          <button
            onClick={togglePause}
            disabled={state.status === 'gameover'}
            className="px-3 py-1.5 rounded-md border border-zinc-700 hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition"
          >
            {state.status === 'paused' ? 'resume' : 'pause'} (P)
          </button>
          <button
            onClick={restart}
            className="px-3 py-1.5 rounded-md border border-zinc-700 hover:border-zinc-500 text-sm transition"
          >
            restart (R)
          </button>
        </div>

        <div className="text-xs text-zinc-500 leading-relaxed mt-4 max-w-[14rem]">
          arrows / WASD &nbsp;·&nbsp; move<br />
          space / P &nbsp;·&nbsp; pause<br />
          R &nbsp;·&nbsp; restart
        </div>
      </aside>
    </div>
  )
}

function Overlay({ children, tone }: { children: React.ReactNode; tone: 'zinc' | 'red' }) {
  const bg = tone === 'red' ? 'bg-zinc-950/85' : 'bg-zinc-950/80'
  return (
    <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 ${bg} backdrop-blur-sm rounded-md`}>
      {children}
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
