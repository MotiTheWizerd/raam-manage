import { memo } from 'react'
import { useSpaceInvaders } from './state/useSpaceInvaders'
import { cleanName, type ScoreEntry } from './state/leaderboard'
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
import { BONUS_H, BONUS_W, BONUSES, type BonusKind } from './state/bonuses'

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

export function SpaceInvaders({ playerName }: { playerName?: string }) {
  const { state, restart, togglePause } = useSpaceInvaders(playerName)
  const rapidActive = (state.effects.rapidFire ?? 0) > 0
  const me = cleanName(playerName)
  // The reducer owns the board (seeded on start, refreshed on game over).
  const board = state.board

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
            className={`absolute rounded-full ${b.fromPlayer ? (rapidActive ? 'bg-orange-400' : 'bg-lime-400') : 'bg-red-500'}`}
            style={{ left: b.x - BULLET_W / 2, top: b.y, width: BULLET_W, height: BULLET_H }}
          />
        ))}

        {/* Falling bonuses — visual comes from the registry per kind. */}
        {state.bonuses.map((b) => {
          const meta = BONUSES[b.kind]
          return (
            <div
              key={b.id}
              className="absolute flex items-center justify-center rounded-md text-[11px] animate-pulse"
              style={{
                left: b.x - BONUS_W / 2,
                top: b.y,
                width: BONUS_W,
                height: BONUS_H,
                background: meta.color,
                filter: `drop-shadow(0 0 5px ${meta.color})`,
              }}
            >
              {meta.glyph}
            </div>
          )
        })}

        {/* Force Field bubble — glows around the ship while the shield is up. */}
        {(state.effects.shield ?? 0) > 0 && (
          <div
            className="pointer-events-none absolute rounded-[50%] border-2 animate-pulse"
            style={{
              left: state.playerX - 10,
              top: PLAYER_Y - 12,
              width: PLAYER_W + 20,
              height: PLAYER_H + 24,
              borderColor: BONUSES.shield.color,
              boxShadow: `0 0 14px ${BONUSES.shield.color}, inset 0 0 10px ${BONUSES.shield.color}`,
            }}
          />
        )}

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

        {state.levelFlash > 0 && state.status === 'playing' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-4xl font-bold tracking-widest text-lime-400 animate-pulse drop-shadow-[0_0_12px_rgba(163,230,53,0.85)]">
              LEVEL {state.stage}
            </div>
          </div>
        )}

        {/* Unreal-style multi-kill callout */}
        {state.announceTimer > 0 && state.announce && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="flex -translate-y-14 flex-col items-center gap-1 animate-pulse"
              style={{ color: state.announce.color }}
            >
              <div className="text-3xl">{state.announce.glyph}</div>
              <div
                className="text-3xl font-extrabold uppercase tracking-widest"
                style={{ textShadow: `0 0 16px ${state.announce.color}` }}
              >
                {state.announce.label}
              </div>
              <div className="text-sm font-bold tabular-nums opacity-80">×{state.combo}</div>
            </div>
          </div>
        )}

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
            <div className="text-zinc-300 text-sm">
              {me} · {state.score} נק׳ · הגעת לשלב {state.stage}
            </div>
            {state.newRecord && (
              <div className="text-amber-300 text-sm animate-pulse">🏆 שיא אישי חדש!</div>
            )}
            <div className="w-64 max-h-52 overflow-y-auto px-1">
              <Leaderboard entries={board} me={me} max={10} title="טבלת השיאים" />
            </div>
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
        <Stat label="level" value={state.stage} />
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

        <Leaderboard entries={board} me={me} max={5} title="שיאי הפקידים" />

        {(Object.keys(state.effects) as BonusKind[])
          .filter((k) => (state.effects[k] ?? 0) > 0)
          .map((k) => {
            const meta = BONUSES[k]
            return (
              <div
                key={k}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                style={{
                  color: meta.color,
                  boxShadow: `inset 0 0 0 1px ${meta.color}`,
                }}
              >
                <span>{meta.glyph}</span>
                <span className="flex-1">{meta.label}</span>
                <span className="tabular-nums">
                  {Math.ceil(((state.effects[k] ?? 0) * 16) / 1000)}s
                </span>
              </div>
            )
          })}

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

// The per-lobbyist tournament board. Shows the top `max`; if the current
// player ranks below the cut, their row is appended so they always see
// where they stand.
function Leaderboard({
  entries,
  me,
  max,
  title,
}: {
  entries: ScoreEntry[]
  me: string
  max: number
  title: string
}) {
  const top = entries.slice(0, max)
  const myRank = entries.findIndex((e) => e.name === me)
  const meShown = myRank >= 0 && myRank < max

  return (
    <div dir="rtl" className="w-full font-mono">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-zinc-500">
        <span>🏆</span>
        <span>{title}</span>
      </div>
      {top.length === 0 ? (
        <div className="text-xs text-zinc-600">עדיין אין שיאים — קדימה!</div>
      ) : (
        <ol className="flex flex-col gap-0.5">
          {top.map((e, i) => (
            <LbRow key={e.name} rank={i + 1} entry={e} isMe={e.name === me} />
          ))}
          {!meShown && myRank >= 0 && (
            <>
              <li className="text-center text-[10px] leading-none text-zinc-600">···</li>
              <LbRow rank={myRank + 1} entry={entries[myRank]} isMe />
            </>
          )}
        </ol>
      )}
    </div>
  )
}

function LbRow({ rank, entry, isMe }: { rank: number; entry: ScoreEntry; isMe: boolean }) {
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
        isMe ? 'bg-cyan-500/15 text-cyan-200' : 'text-zinc-300'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="w-4 tabular-nums text-zinc-500">{rank}.</span>
        <span className="truncate">{entry.name}</span>
      </span>
      <span className="tabular-nums font-semibold">{entry.score}</span>
    </li>
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
