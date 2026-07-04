import {
  createInvaders,
  enemyShootRate,
  invaderMoveRate,
  invadersReachedPlayer,
  moveBullets,
  randomEnemyShoot,
  resolveEnemyBullets,
  resolvePlayerBullets,
  rowPoints,
  stepInvaders,
} from '../engine'
import {
  INV_H,
  INV_W,
  PLAY_W,
  PLAYER_H,
  PLAYER_SHOOT_COOLDOWN,
  PLAYER_SPEED,
  PLAYER_W,
  PLAYER_Y,
  type GameState,
} from '../types'
import {
  anyInvaderInShieldZone,
  createShields,
  resolveShieldHits,
  stompShields,
  type Shield,
} from '../shields'
import { writeBest } from './bestScore'
import { readLeaderboard, recordScore, type ScoreEntry } from './leaderboard'
import {
  ANNOUNCE_TICKS,
  COMBO_GAP_TICKS,
  tierCrossed,
  type Announcement,
} from './killstreak'
import type { GameEvent } from './events'
import { burstParticles, stepParticles, type Particle } from './particles'
import {
  BONUSES,
  catchBonuses,
  maybeDropBonus,
  stepBonuses,
  tickEffects,
  type ActiveEffects,
  type Bonus,
} from './bonuses'

const HIT_PAUSE_TICKS = 50   // ~0.8s death freeze
const INVULN_TICKS = 90      // ~1.5s respawn invulnerability
const RAPID_FIRE_COOLDOWN = 5 // shoot cooldown while Rapid Fire is up (vs 18)
const LEVEL_FLASH_TICKS = 90 // ~1.5s "LEVEL N" banner after clearing a wave

export type State = GameState & {
  events: GameEvent[]
  shields: Shield[]
  hitPause: number
  invuln: number
  particles: Particle[]
  // Which wave we're on — each stage brings its own bonus pool (see bonuses.ts).
  stage: number
  // Ticks remaining on the "LEVEL N" banner shown right after a wave clears.
  levelFlash: number
  bonuses: Bonus[]
  // Active timed bonus effects — kind -> ticks remaining.
  effects: ActiveEffects
  // Logged-in lobbyist, recorded to the leaderboard on game over.
  playerName: string
  // True when the last game over set a new personal best (for the win banner).
  newRecord: boolean
  // The per-lobbyist high-score board, refreshed on game over.
  board: ScoreEntry[]
  // Multi-kill streak: consecutive shooting kills + the window ticks left.
  combo: number
  comboTimer: number
  // Current on-screen kill callout + its remaining display ticks.
  announce: Announcement | null
  announceTimer: number
}

export type Keys = { left: boolean; right: boolean; shoot: boolean }

export type Action =
  | { type: 'tick'; keys: Keys }
  | { type: 'toggle-pause' }
  | { type: 'restart' }

export function initialState(best: number, playerName = ''): State {
  const invaders = createInvaders()
  const aliveCount = invaders.length
  return {
    playerX: PLAY_W / 2 - PLAYER_W / 2,
    invaders,
    bullets: [],
    invaderDir: 1,
    invaderTickLeft: invaderMoveRate(aliveCount),
    score: 0,
    best,
    lives: 3,
    status: 'playing',
    nextId: 1000,
    playerShootCooldown: 0,
    enemyShootCooldown: enemyShootRate(aliveCount),
    animFrame: 0,
    events: [],
    shields: createShields(),
    hitPause: 0,
    invuln: 0,
    particles: [],
    stage: 1,
    levelFlash: 0,
    bonuses: [],
    effects: {},
    playerName,
    newRecord: false,
    board: readLeaderboard(),
    combo: 0,
    comboTimer: 0,
    announce: null,
    announceTimer: 0,
  }
}

// Wave cleared → next level. Same difficulty for now (fresh identical wave);
// score, lives, best, shields and active bonus effects all carry over. This is
// the seam where per-stage difficulty/pools plug in later (see bonuses.ts).
function advanceLevel(state: State): State {
  const stage = state.stage + 1
  const invaders = createInvaders()
  const aliveCount = invaders.length
  return {
    ...state,
    stage,
    invaders,
    invaderDir: 1,
    invaderTickLeft: invaderMoveRate(aliveCount, stage),
    enemyShootCooldown: enemyShootRate(aliveCount),
    bullets: [],
    bonuses: [],
    levelFlash: LEVEL_FLASH_TICKS,
    events: [...state.events, { type: 'level-up', stage }],
  }
}

function endGame(state: State, status: 'victory' | 'gameover'): State {
  const best = Math.max(state.best, state.score)
  if (best > state.best) writeBest(best)
  // Log this run to the per-lobbyist tournament board; flag a personal best.
  const { entries, isRecord } = recordScore(state.playerName, state.score, state.stage)
  return {
    ...state,
    status,
    best,
    newRecord: isRecord,
    board: entries,
    events: [...state.events, { type: status }],
  }
}

function tick(state: State, keys: Keys): State {
  let {
    playerX,
    invaders,
    bullets,
    invaderDir,
    invaderTickLeft,
    score,
    lives,
    nextId,
    playerShootCooldown,
    enemyShootCooldown,
    animFrame,
    shields,
    hitPause,
    invuln,
    particles,
    bonuses,
    effects,
    levelFlash,
    combo,
    comboTimer,
    announce,
    announceTimer,
  } = state
  const events: GameEvent[] = []

  // death pause: the world freezes, only the explosion plays out
  if (hitPause > 0) {
    hitPause--
    particles = stepParticles(particles)
    if (hitPause === 0) {
      invuln = INVULN_TICKS
      bullets = []
    }
    return { ...state, hitPause, invuln, bullets, particles, events }
  }

  invuln = Math.max(0, invuln - 1)
  levelFlash = Math.max(0, levelFlash - 1)
  announceTimer = Math.max(0, announceTimer - 1)
  // the multi-kill window closes → the streak resets
  if (comboTimer > 0 && --comboTimer === 0) combo = 0
  particles = stepParticles(particles)
  effects = tickEffects(effects)

  // move player
  if (keys.left) playerX = Math.max(0, playerX - PLAYER_SPEED)
  if (keys.right) playerX = Math.min(PLAY_W - PLAYER_W, playerX + PLAYER_SPEED)

  // player shoot (Rapid Fire shortens the cooldown; Triple Shot fires 3 streams)
  const rapidFire = (effects.rapidFire ?? 0) > 0
  const tripleShot = (effects.tripleShot ?? 0) > 0
  if (keys.shoot && playerShootCooldown <= 0) {
    const cx = playerX + PLAYER_W / 2
    if (tripleShot) {
      bullets = [
        ...bullets,
        { id: nextId++, x: cx - 14, y: PLAYER_Y, fromPlayer: true },
        { id: nextId++, x: cx, y: PLAYER_Y, fromPlayer: true },
        { id: nextId++, x: cx + 14, y: PLAYER_Y, fromPlayer: true },
      ]
    } else {
      bullets = [...bullets, { id: nextId++, x: cx, y: PLAYER_Y, fromPlayer: true }]
    }
    playerShootCooldown = rapidFire ? RAPID_FIRE_COOLDOWN : PLAYER_SHOOT_COOLDOWN
  } else {
    playerShootCooldown = Math.max(0, playerShootCooldown - 1)
  }

  // move all bullets
  bullets = moveBullets(bullets)

  // enemy shoot on cooldown
  enemyShootCooldown--
  if (enemyShootCooldown <= 0) {
    const newBullet = randomEnemyShoot(invaders, nextId++)
    if (newBullet) bullets = [...bullets, newBullet]
    enemyShootCooldown = enemyShootRate(invaders.filter((i) => i.alive).length)
  }

  // step invader formation on sub-tick
  invaderTickLeft--
  if (invaderTickLeft <= 0) {
    const stepped = stepInvaders(invaders, invaderDir)
    invaders = stepped.invaders
    invaderDir = stepped.dir
    invaderTickLeft = invaderMoveRate(invaders.filter((i) => i.alive).length, state.stage)
    animFrame = animFrame === 0 ? 1 : 0
    events.push({ type: 'march-step' })
    if (anyInvaderInShieldZone(invaders)) {
      shields = stompShields(invaders, shields)
    }
  }

  // shields absorb bullets from both sides
  const shieldHits = resolveShieldHits(bullets, shields)
  bullets = shieldHits.bullets
  shields = shieldHits.shields
  for (let i = 0; i < shieldHits.hits; i++) events.push({ type: 'shield-hit' })

  // player bullets vs invaders
  const playerHits = resolvePlayerBullets(bullets, invaders)
  let bulletKills = 0
  for (let i = 0; i < invaders.length; i++) {
    if (invaders[i].alive && !playerHits.invaders[i].alive) {
      const row = invaders[i].row
      bulletKills++
      events.push({ type: 'invader-killed', row, points: rowPoints(row) })
      // roll a bonus drop from this stage's pool at the dead invader's spot
      const drop = maybeDropBonus(invaders[i].x, invaders[i].y, state.stage, nextId++)
      if (drop) bonuses = [...bonuses, drop]
    }
  }
  bullets = playerHits.bullets
  invaders = playerHits.invaders
  score += playerHits.scored

  // multi-kill streak — only direct shots count; a bigger jump (Triple Shot)
  // can leap tiers in one tick. Announce the top tier newly crossed.
  if (bulletKills > 0) {
    const prevCombo = combo
    combo += bulletKills
    comboTimer = COMBO_GAP_TICKS
    const tier = tierCrossed(prevCombo, combo)
    if (tier) {
      announce = { label: tier.label, glyph: tier.glyph, color: tier.color }
      announceTimer = ANNOUNCE_TICKS
    }
  }

  // enemy bullets vs player (invulnerable right after respawn OR while the
  // Force Field bonus is active)
  const shielded = (effects.shield ?? 0) > 0
  if (invuln <= 0 && !shielded) {
    const enemyHits = resolveEnemyBullets(bullets, playerX)
    bullets = enemyHits.bullets
    if (enemyHits.hit) {
      lives--
      events.push({ type: 'player-hit' })
      // taking a hit breaks the kill streak
      combo = 0
      comboTimer = 0
      const burst = burstParticles(playerX + PLAYER_W / 2, PLAYER_Y + PLAYER_H / 2, nextId)
      nextId += burst.length
      particles = [...particles, ...burst]
      if (lives > 0) hitPause = HIT_PAUSE_TICKS
    }
  }

  // bonuses fall; the ship collects any it overlaps, applying its effect
  bonuses = stepBonuses(bonuses)
  const grabbed = catchBonuses(bonuses, playerX)
  bonuses = grabbed.remaining
  for (const b of grabbed.caught) {
    events.push({ type: 'bonus-collected', kind: b.kind })
    const meta = BONUSES[b.kind]
    if (meta.duration > 0) {
      // timed effect — (re)start its countdown
      effects = { ...effects, [b.kind]: meta.duration }
    } else if (b.kind === 'smartBomb') {
      // instant — detonate the bottom-most alive invader row + wipe enemy fire
      let bottomRow = -1
      for (const inv of invaders) {
        if (inv.alive && inv.row > bottomRow) bottomRow = inv.row
      }
      if (bottomRow >= 0) {
        invaders = invaders.map((inv) => {
          if (!(inv.alive && inv.row === bottomRow)) return inv
          score += rowPoints(inv.row)
          events.push({ type: 'invader-killed', row: inv.row, points: rowPoints(inv.row) })
          const rowBurst = burstParticles(inv.x + INV_W / 2, inv.y + INV_H / 2, nextId)
          nextId += rowBurst.length
          particles = [...particles, ...rowBurst]
          return { ...inv, alive: false }
        })
      }
      bullets = bullets.filter((bl) => bl.fromPlayer)
    }
    // catch spark
    const burst = burstParticles(b.x, b.y, nextId)
    nextId += burst.length
    particles = [...particles, ...burst]
  }

  const next: State = {
    ...state,
    playerX,
    invaders,
    bullets,
    invaderDir,
    invaderTickLeft,
    score,
    lives,
    nextId,
    playerShootCooldown,
    enemyShootCooldown,
    animFrame,
    shields,
    hitPause,
    invuln,
    particles,
    bonuses,
    effects,
    levelFlash,
    combo,
    comboTimer,
    announce,
    announceTimer,
    events,
  }

  const aliveCount = invaders.filter((i) => i.alive).length
  // wave cleared → roll straight into the next level (endless for now)
  if (aliveCount === 0) return advanceLevel(next)
  if (lives <= 0 || invadersReachedPlayer(invaders)) {
    return endGame({ ...next, lives: Math.max(0, lives) }, 'gameover')
  }
  return next
}

export function reducer(state: State, action: Action): State {
  if (action.type === 'restart') return initialState(state.best, state.playerName)

  if (action.type === 'toggle-pause') {
    if (state.status === 'gameover' || state.status === 'victory') return state
    return { ...state, status: state.status === 'playing' ? 'paused' : 'playing' }
  }

  if (state.status !== 'playing') return state

  return tick(state, action.keys)
}
