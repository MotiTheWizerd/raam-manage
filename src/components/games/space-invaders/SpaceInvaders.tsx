import { memo } from 'react'
import { useSpaceInvaders } from './state/useSpaceInvaders'
import {
  BULLET_H,
  BULLET_W,
  INV_H,
  INV_W,
  PLAY_H,
  PLAY_W,
  PLAYER_H,
  PLAYER_W,
  PLAYER_Y,
  type AnimFrame,
} from './types'
import {
  MAX_SPRITE_W_CELLS,
  PLAYER_COLOR,
  PLAYER_PIXEL,
  PLAYER_SPRITE,
  ROW_CONFIG,
  SPRITES,
  SPRITE_PIXEL,
} from './sprites'

const PlayerShip = memo(function PlayerShip() {
  const pixels: React.ReactNode[] = []
  for (let r = 0; r < PLAYER_SPRITE.length; r++) {
    const rowStr = PLAYER_SPRITE[r]
    for (let c = 0; c < rowStr.length; c++) {
      if (rowStr[c] !== 'X') continue
      pixels.push(
        <span
          key={`${r}:${c}`}
          className="absolute"
          style={{
            left: c * PLAYER_PIXEL,
            top: r * PLAYER_PIXEL,
            width: PLAYER_PIXEL,
            height: PLAYER_PIXEL,
            background: PLAYER_COLOR,
          }}
        />,
      )
    }
  }
  return <>{pixels}</>
})
import {
  SHIELD_CELLS_H,
  SHIELD_CELLS_W,
  SHIELD_COLOR,
  SHIELD_H,
  SHIELD_PIXEL,
  SHIELD_W,
} from './shields'

const ShieldSprite = memo(function ShieldSprite({ cells }: { cells: boolean[][] }) {
  const pixels: React.ReactNode[] = []
  for (let r = 0; r < SHIELD_CELLS_H; r++) {
    for (let c = 0; c < SHIELD_CELLS_W; c++) {
      if (!cells[r][c]) continue
      pixels.push(
        <span
          key={`${r}:${c}`}
          className="absolute"
          style={{
            left: c * SHIELD_PIXEL,
            top: r * SHIELD_PIXEL,
            width: SHIELD_PIXEL,
            height: SHIELD_PIXEL,
            background: SHIELD_COLOR,
          }}
        />,
      )
    }
  }
  return <>{pixels}</>
})

const InvaderSprite = memo(function InvaderSprite({
  row,
  frame,
}: {
  row: number
  frame: AnimFrame
}) {
  const cfg = ROW_CONFIG[row]
  const grid = SPRITES[cfg.key][frame]
  const w = grid[0].length
  const offsetX = Math.floor((MAX_SPRITE_W_CELLS - w) / 2) * SPRITE_PIXEL
  const pixels: React.ReactNode[] = []
  for (let r = 0; r < grid.length; r++) {
    const rowStr = grid[r]
    for (let c = 0; c < w; c++) {
      if (rowStr[c] !== 'X') continue
      pixels.push(
        <span
          key={`${r}:${c}`}
          className="absolute"
          style={{
            left: offsetX + c * SPRITE_PIXEL,
            top: r * SPRITE_PIXEL,
            width: SPRITE_PIXEL,
            height: SPRITE_PIXEL,
            background: cfg.color,
          }}
        />,
      )
    }
  }
  return <>{pixels}</>
})

function invaderGlow(row: number): string {
  return `drop-shadow(0 0 3px ${ROW_CONFIG[row].color})`
}

export function SpaceInvaders() {
  const { state, restart, togglePause } = useSpaceInvaders()

  return (
    <div className="flex flex-col md:flex-row items-start gap-8 p-6">
      <div
        className="relative bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden flex-shrink-0"
        style={{ width: PLAY_W, height: PLAY_H }}
      >
        {state.invaders.map((inv) =>
          inv.alive ? (
            <div
              key={inv.id}
              className="absolute"
              style={{
                left: inv.x,
                top: inv.y,
                width: INV_W,
                height: INV_H,
                filter: invaderGlow(inv.row),
              }}
            >
              <InvaderSprite row={inv.row} frame={state.animFrame} />
            </div>
          ) : null,
        )}

        {state.shields.map((s, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: s.x,
              top: s.y,
              width: SHIELD_W,
              height: SHIELD_H,
              filter: `drop-shadow(0 0 3px ${SHIELD_COLOR})`,
            }}
          >
            <ShieldSprite cells={s.cells} />
          </div>
        ))}

        {state.bullets.map((b) => (
          <div
            key={b.id}
            className={`absolute rounded-full ${b.fromPlayer ? 'bg-lime-400' : 'bg-red-500'}`}
            style={{ left: b.x - BULLET_W / 2, top: b.y, width: BULLET_W, height: BULLET_H }}
          />
        ))}

        {state.hitPause === 0 && (state.invuln === 0 || Math.floor(state.invuln / 5) % 2 === 0) && (
          <div
            className="absolute"
            style={{
              left: state.playerX,
              top: PLAYER_Y,
              width: PLAYER_W,
              height: PLAYER_H,
              filter: `drop-shadow(0 0 3px ${PLAYER_COLOR})`,
            }}
          >
            <PlayerShip />
          </div>
        )}

        {state.particles.map((p) => (
          <div
            key={p.id}
            className="absolute"
            style={{
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              background: PLAYER_COLOR,
              opacity: p.life,
              filter: `drop-shadow(0 0 4px ${PLAYER_COLOR})`,
            }}
          />
        ))}

        {state.status === 'paused' && (
          <Overlay>
            <div className="text-3xl font-bold text-zinc-200">PAUSED</div>
            <button
              onClick={togglePause}
              className="px-4 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold transition"
            >
              resume (P)
            </button>
          </Overlay>
        )}

        {state.status === 'gameover' && (
          <Overlay>
            <div className="text-3xl font-bold text-red-400">GAME OVER</div>
            <div className="text-zinc-300">score: {state.score}</div>
            {state.score > 0 && state.score === state.best && (
              <div className="text-amber-300 text-sm">★ new best ★</div>
            )}
            <button
              onClick={restart}
              className="px-4 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold transition"
            >
              play again (R)
            </button>
          </Overlay>
        )}

        {state.status === 'victory' && (
          <Overlay>
            <div className="text-3xl font-bold text-lime-400">YOU WIN!</div>
            <div className="text-zinc-300">score: {state.score}</div>
            {state.score === state.best && state.best > 0 && (
              <div className="text-amber-300 text-sm">★ new best ★</div>
            )}
            <button
              onClick={restart}
              className="px-4 py-2 rounded-md bg-lime-500 hover:bg-lime-400 text-zinc-950 font-semibold transition"
            >
              play again (R)
            </button>
          </Overlay>
        )}
      </div>

      <aside className="flex flex-col gap-4 text-zinc-200 font-mono">
        <Stat label="score" value={state.score} />
        <Stat label="best" value={state.best} />

        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">lives</div>
          <div className="flex gap-1">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-sm transition ${i < state.lives ? 'bg-cyan-400' : 'bg-zinc-700'}`}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2 mt-2">
          <button
            onClick={togglePause}
            disabled={state.status === 'gameover' || state.status === 'victory'}
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
          ← → / A D &nbsp;·&nbsp; move<br />
          space / ↑ &nbsp;·&nbsp; shoot<br />
          P &nbsp;·&nbsp; pause<br />
          R &nbsp;·&nbsp; restart
        </div>

        <div className="flex flex-col gap-1.5 mt-4">
          {[
            { color: 'bg-fuchsia-400', pts: 30 },
            { color: 'bg-violet-400', pts: 20 },
            { color: 'bg-sky-400', pts: 10 },
          ].map(({ color, pts }) => (
            <div key={pts} className="flex items-center gap-2 text-xs text-zinc-500">
              <span className={`w-5 h-2.5 rounded-sm inline-block ${color}`} />
              {pts} pts
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950/85 backdrop-blur-sm rounded-md">
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
