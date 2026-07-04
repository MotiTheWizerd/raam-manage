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
import type { GameEvent } from './events'
import { burstParticles, stepParticles, type Particle } from './particles'

const HIT_PAUSE_TICKS = 50   // ~0.8s death freeze
const INVULN_TICKS = 90      // ~1.5s respawn invulnerability

export type State = GameState & {
  events: GameEvent[]
  shields: Shield[]
  hitPause: number
  invuln: number
  particles: Particle[]
}

export type Keys = { left: boolean; right: boolean; shoot: boolean }

export type Action =
  | { type: 'tick'; keys: Keys }
  | { type: 'toggle-pause' }
  | { type: 'restart' }

export function initialState(best: number): State {
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
  }
}

function endGame(state: State, status: 'victory' | 'gameover'): State {
  const best = Math.max(state.best, state.score)
  if (best > state.best) writeBest(best)
  return { ...state, status, best, events: [...state.events, { type: status }] }
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
  particles = stepParticles(particles)

  // move player
  if (keys.left) playerX = Math.max(0, playerX - PLAYER_SPEED)
  if (keys.right) playerX = Math.min(PLAY_W - PLAYER_W, playerX + PLAYER_SPEED)

  // player shoot
  if (keys.shoot && playerShootCooldown <= 0) {
    bullets = [
      ...bullets,
      { id: nextId++, x: playerX + PLAYER_W / 2, y: PLAYER_Y, fromPlayer: true },
    ]
    playerShootCooldown = PLAYER_SHOOT_COOLDOWN
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
    invaderTickLeft = invaderMoveRate(invaders.filter((i) => i.alive).length)
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
  for (let i = 0; i < invaders.length; i++) {
    if (invaders[i].alive && !playerHits.invaders[i].alive) {
      const row = invaders[i].row
      events.push({ type: 'invader-killed', row, points: rowPoints(row) })
    }
  }
  bullets = playerHits.bullets
  invaders = playerHits.invaders
  score += playerHits.scored

  // enemy bullets vs player (invulnerable right after respawn)
  if (invuln <= 0) {
    const enemyHits = resolveEnemyBullets(bullets, playerX)
    bullets = enemyHits.bullets
    if (enemyHits.hit) {
      lives--
      events.push({ type: 'player-hit' })
      const burst = burstParticles(playerX + PLAYER_W / 2, PLAYER_Y + PLAYER_H / 2, nextId)
      nextId += burst.length
      particles = [...particles, ...burst]
      if (lives > 0) hitPause = HIT_PAUSE_TICKS
    }
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
    events,
  }

  const aliveCount = invaders.filter((i) => i.alive).length
  if (aliveCount === 0) return endGame(next, 'victory')
  if (lives <= 0 || invadersReachedPlayer(invaders)) {
    return endGame({ ...next, lives: Math.max(0, lives) }, 'gameover')
  }
  return next
}

export function reducer(state: State, action: Action): State {
  if (action.type === 'restart') return initialState(state.best)

  if (action.type === 'toggle-pause') {
    if (state.status === 'gameover' || state.status === 'victory') return state
    return { ...state, status: state.status === 'playing' ? 'paused' : 'playing' }
  }

  if (state.status !== 'playing') return state

  return tick(state, action.keys)
}
