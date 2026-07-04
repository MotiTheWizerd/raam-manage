import {
  BULLET_H,
  BULLET_W,
  ENEMY_BULLET_SPEED,
  ENEMY_SHOOT_BASE,
  INV_COLS,
  INV_COL_GAP,
  INV_DROP_Y,
  INV_H,
  INV_ROWS,
  INV_ROW_GAP,
  INV_START_X,
  INV_START_Y,
  INV_STEP_X,
  INV_W,
  PLAY_H,
  PLAY_W,
  PLAYER_BULLET_SPEED,
  PLAYER_H,
  PLAYER_W,
  PLAYER_Y,
  type Bullet,
  type InvaderDir,
  type Invader,
} from './types'

export function createInvaders(): Invader[] {
  const invaders: Invader[] = []
  let id = 0
  for (let row = 0; row < INV_ROWS; row++) {
    for (let col = 0; col < INV_COLS; col++) {
      invaders.push({
        id: id++,
        x: INV_START_X + col * (INV_W + INV_COL_GAP),
        y: INV_START_Y + row * (INV_H + INV_ROW_GAP),
        row,
        alive: true,
      })
    }
  }
  return invaders
}

export function rowPoints(row: number): number {
  if (row === 0) return 30
  if (row === 1) return 20
  return 10
}

export function invaderMoveRate(aliveCount: number): number {
  const total = INV_ROWS * INV_COLS
  const ratio = aliveCount / total
  return Math.max(4, Math.round(4 + ratio * 52))
}

export function enemyShootRate(aliveCount: number): number {
  const ratio = aliveCount / (INV_ROWS * INV_COLS)
  return Math.max(20, Math.round(ENEMY_SHOOT_BASE * ratio))
}

export function stepInvaders(
  invaders: Invader[],
  dir: InvaderDir,
): { invaders: Invader[]; dir: InvaderDir } {
  const alive = invaders.filter((inv) => inv.alive)
  const dx = dir * INV_STEP_X
  const hitRight = alive.some((inv) => inv.x + INV_W + dx >= PLAY_W)
  const hitLeft = alive.some((inv) => inv.x + dx <= 0)
  const hitWall = dir === 1 ? hitRight : hitLeft

  const newDir: InvaderDir = hitWall ? (dir === 1 ? -1 : 1) : dir
  const moveX = hitWall ? 0 : dx
  const moveY = hitWall ? INV_DROP_Y : 0

  return {
    dir: newDir,
    invaders: invaders.map((inv) => ({ ...inv, x: inv.x + moveX, y: inv.y + moveY })),
  }
}

export function moveBullets(bullets: Bullet[]): Bullet[] {
  return bullets
    .map((b) => ({
      ...b,
      y: b.fromPlayer ? b.y - PLAYER_BULLET_SPEED : b.y + ENEMY_BULLET_SPEED,
    }))
    .filter((b) => b.y > -BULLET_H && b.y < PLAY_H + BULLET_H)
}

function overlaps(
  bCX: number, bY: number,
  ix: number, iy: number, iw: number, ih: number,
): boolean {
  const bL = bCX - BULLET_W / 2
  const bR = bCX + BULLET_W / 2
  return bR > ix && bL < ix + iw && bY + BULLET_H > iy && bY < iy + ih
}

export function resolvePlayerBullets(
  bullets: Bullet[],
  invaders: Invader[],
): { bullets: Bullet[]; invaders: Invader[]; scored: number } {
  const hitBullets = new Set<number>()
  const hitInvaders = new Set<number>()
  let scored = 0

  const playerBullets = bullets.filter((b) => b.fromPlayer)
  const alive = invaders.filter((inv) => inv.alive)

  for (const bullet of playerBullets) {
    for (const inv of alive) {
      if (hitInvaders.has(inv.id)) continue
      if (overlaps(bullet.x, bullet.y, inv.x, inv.y, INV_W, INV_H)) {
        hitBullets.add(bullet.id)
        hitInvaders.add(inv.id)
        scored += rowPoints(inv.row)
        break
      }
    }
  }

  return {
    bullets: bullets.filter((b) => !hitBullets.has(b.id)),
    invaders: invaders.map((inv) => (hitInvaders.has(inv.id) ? { ...inv, alive: false } : inv)),
    scored,
  }
}

export function resolveEnemyBullets(
  bullets: Bullet[],
  playerX: number,
): { bullets: Bullet[]; hit: boolean } {
  const hitIds = new Set<number>()
  const enemyBullets = bullets.filter((b) => !b.fromPlayer)

  for (const b of enemyBullets) {
    if (overlaps(b.x, b.y, playerX, PLAYER_Y, PLAYER_W, PLAYER_H)) {
      hitIds.add(b.id)
    }
  }

  return {
    bullets: bullets.filter((b) => !hitIds.has(b.id)),
    hit: hitIds.size > 0,
  }
}

export function randomEnemyShoot(invaders: Invader[], nextId: number): Bullet | null {
  const alive = invaders.filter((inv) => inv.alive)
  if (alive.length === 0) return null

  // only bottom-most invader per column can shoot
  const byCol = new Map<number, Invader>()
  for (const inv of alive) {
    const col = Math.round(inv.x / (INV_W + INV_COL_GAP))
    const existing = byCol.get(col)
    if (!existing || inv.y > existing.y) byCol.set(col, inv)
  }

  const shooters = Array.from(byCol.values())
  const shooter = shooters[Math.floor(Math.random() * shooters.length)]
  return {
    id: nextId,
    x: shooter.x + INV_W / 2,
    y: shooter.y + INV_H,
    fromPlayer: false,
  }
}

export function invadersReachedPlayer(invaders: Invader[]): boolean {
  return invaders.some((inv) => inv.alive && inv.y + INV_H >= PLAYER_Y)
}
