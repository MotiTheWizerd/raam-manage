export type Particle = {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  life: number
  size: number
}

export const BURST_COUNT = 18

export function burstParticles(cx: number, cy: number, baseId: number): Particle[] {
  const out: Particle[] = []
  for (let i = 0; i < BURST_COUNT; i++) {
    const angle = (i / BURST_COUNT) * Math.PI * 2 + Math.random() * 0.5
    const speed = 1.5 + Math.random() * 3
    out.push({
      id: baseId + i,
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      size: 2 + Math.random() * 3,
    })
  }
  return out
}

export function stepParticles(particles: Particle[]): Particle[] {
  if (particles.length === 0) return particles
  const next: Particle[] = []
  for (const p of particles) {
    const life = p.life - 0.02 - Math.random() * 0.015
    if (life <= 0) continue
    next.push({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.1, life })
  }
  return next
}
