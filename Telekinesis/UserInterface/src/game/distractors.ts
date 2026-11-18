import * as pl from 'planck'
import type { Ball, Swarm } from './swarm'
import { PHYS, type PhysicsWorld } from './physics'

/**
 * Things that pull the swarm away from what you are doing. They are environmental FORCES on floating balls — the stop
 * gesture, the comet, the pinch all still work against them; a distraction only wins while you let it.
 * Resting balls (on the floor) are never affected, so the heap is always safe to start from.
 */
export interface Lantern {
  kind: 'lantern'
  x: number
  y: number
  radius: number
}
export interface Fan {
  kind: 'fan'
  /** the centre of the wind zone, and its size (world units) */
  x: number
  y: number
  w: number
  h: number
  /** unit vector the wind blows along */
  dir: { x: number; y: number }
  /** seconds per cycle, of which `onTime` it blows; `offset` shifts the cycle (so it can start off) */
  period: number
  onTime: number
  offset: number
}
export interface Whirlpool {
  kind: 'whirlpool'
  x: number
  y: number
  radius: number
  /** a ball this close to the centre is swallowed (and recycled to the start heap) */
  core: number
}
export type Distractor = Lantern | Fan | Whirlpool

export const DISTRACT = {
  /** only balls floating at least this much (lev) feel them */
  floatingLev: 0.3,
  /** lantern: pull toward it (units/s² at the centre, falling off with the square of the distance) + a sideways swirl */
  lanternPull: 2600,
  lanternSwirl: 900,
  /** fan: wind acceleration on balls and on balloons (units/s²) */
  fanAccel: 1800,
  /**
   * whirlpool: pull (falls off ^1.5) + swirl. TUNED with probes: at swirl 1600 the balls just orbit it (3 swallowed in
   * 8 s from 250 units away, none from 450); at pull 4800 / swirl 550 a swarm lingering within ~650 units is swallowed
   * within a few seconds, while one that keeps moving (comet ≥ ~1400 u/s²) gets away.
   */
  whirlPull: 4800,
  whirlSwirl: 550,
}

/** Is the fan blowing at time t? */
export function fanOn(f: Fan, t: number): boolean {
  const phase = (((t + f.offset) % f.period) + f.period) % f.period
  return phase < f.onTime
}

/**
 * Apply every distractor to the swarm for this frame.
 * `recycle` is called for each ball a whirlpool swallows (the caller puts it back on the start heap).
 * Returns how many balls were swallowed.
 */
export function applyDistractors(
  list: readonly Distractor[],
  swarm: Swarm,
  phys: PhysicsWorld,
  t: number,
  dt: number,
  recycle: (ball: Ball, index: number) => void,
): number {
  let swallowed = 0
  const D = DISTRACT
  for (const d of list) {
    if (d.kind === 'fan') {
      if (!fanOn(d, t)) continue
      const x0 = d.x - d.w / 2
      const y0 = d.y - d.h / 2
      for (const b of swarm.balls) {
        if (b.lev < D.floatingLev) continue
        if (b.x < x0 || b.x > x0 + d.w || b.y < y0 || b.y > y0 + d.h) continue
        b.vx += d.dir.x * D.fanAccel * dt
        b.vy += d.dir.y * D.fanAccel * dt
      }
      // the wind also bends the balloons (the one light prop): a force = mass × acceleration
      for (const p of phys.props) {
        if (p.kind !== 'balloon' || !p.alive) continue
        const c = phys.pos(p)
        if (c.x < x0 || c.x > x0 + d.w || c.y < y0 || c.y > y0 + d.h) continue
        const m = p.body.getMass() * D.fanAccel * PHYS.scale
        p.body.applyForceToCenter(pl.Vec2(d.dir.x * m, d.dir.y * m), true)
      }
      continue
    }
    const R = d.radius
    for (let i = 0; i < swarm.balls.length; i++) {
      const b = swarm.balls[i]!
      if (b.lev < D.floatingLev) continue
      const dx = d.x - b.x
      const dy = d.y - b.y
      const dist = Math.hypot(dx, dy)
      if (dist >= R) continue
      if (d.kind === 'whirlpool' && dist < d.core) {
        recycle(b, i)
        swallowed++
        continue
      }
      if (dist < 1) continue
      const k = 1 - dist / R
      const ux = dx / dist
      const uy = dy / dist
      const pull = d.kind === 'lantern' ? D.lanternPull * k * k : D.whirlPull * Math.pow(k, 1.5)
      const swirl = d.kind === 'lantern' ? D.lanternSwirl * k : D.whirlSwirl * k
      b.vx += (ux * pull - uy * swirl) * dt
      b.vy += (uy * pull + ux * swirl) * dt
    }
  }
  return swallowed
}
