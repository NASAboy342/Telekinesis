import * as pl from 'planck'
import type { Swarm } from './swarm'
import { PHYS, type PhysicsWorld, type Prop } from './physics'

/**
 * Makes the swarm (its own force model, in world units) and the rigid-body props (planck, in metres) touch.
 * Every ball — floating or resting — collides with every prop: it is pushed out of it, the contact applies an impulse
 * to the prop AT THE CONTACT POINT (so hits make things spin, not only slide) and the ball bounces using the relative
 * velocity there (including the prop's own spin and motion), so props push the balls back just as hard.
 */
export const COUPLING = {
  /**
   * kg. TUNED with probes (the real swarm flying into real props): at 0.04 a comet hit a 20-crate tower 200+ times and
   * moved it 3 units; at 0.4 a lone crate rocketed away at 16 m/s. At 0.2 (the swarm ≈ 12 kg) a comet aimed low on a
   * 2×10 tower of 1.7 kg crates (density 1.4, friction 0.35) tumbles ~8 of 20 crates, aimed high ~16 of 20; a lone crate gets a
   * proper whack (~17 m/s peak), a 15 kg boulder rolls off at ~8 m/s, a heavy pyramid shrugs off a low hit.
   */
  ballMass: 0.2,
  /** how bouncy a ball is against a prop */
  restitution: 0.3,
  /** closing speeds (m/s) below this are not reported as hits (resting balls, light brushes) */
  minHitSpeed: 0.3,
}

/** One ball hitting one prop. `speed` is the closing speed in m/s (a drifting ball ≈ 1–3, a comet head ≈ 15–40). */
export interface BallHit {
  prop: Prop
  speed: number
  /** world units */
  x: number
  y: number
}

const S = PHYS.scale
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** Resolve all ball ↔ prop contacts for this frame. Returns the hits (for popping, ringing, sounds). */
export function couple(swarm: Swarm, phys: PhysicsWorld): BallHit[] {
  const hits: BallHit[] = []
  const r = swarm.radius * S
  const mb = COUPLING.ballMass
  const found: pl.Fixture[] = []
  const collect = (f: pl.Fixture) => {
    found.push(f)
    return true
  }
  for (const ball of swarm.balls) {
    const cx = ball.x * S
    const cy = ball.y * S
    found.length = 0
    phys.world.queryAABB(
      { lowerBound: pl.Vec2(cx - r, cy - r), upperBound: pl.Vec2(cx + r, cy + r) },
      collect,
    )
    for (const fixture of found) {
      const body = fixture.getBody()
      const prop = body.getUserData() as Prop | null
      if (!prop || !prop.alive || prop.kind === 'ground' || prop.kind === 'wall') continue

      // contact between the ball (centre c, radius r) and the prop: a world normal (prop → ball), the depth and the point
      const c = pl.Vec2(ball.x * S, ball.y * S)
      let n: pl.Vec2
      let pen: number
      let point: pl.Vec2
      if (prop.shape.type === 'box') {
        const hx = prop.shape.hw * S
        const hy = prop.shape.hh * S
        const local = body.getLocalPoint(c)
        let nx: number
        let ny: number
        let px: number
        let py: number
        if (Math.abs(local.x) < hx && Math.abs(local.y) < hy) {
          // the ball's centre is inside the box: leave through the nearest face
          const dx = hx - Math.abs(local.x)
          const dy = hy - Math.abs(local.y)
          if (dx < dy) {
            nx = Math.sign(local.x) || 1
            ny = 0
            px = nx * hx
            py = local.y
            pen = dx + r
          } else {
            nx = 0
            ny = Math.sign(local.y) || 1
            px = local.x
            py = ny * hy
            pen = dy + r
          }
        } else {
          px = clamp(local.x, -hx, hx)
          py = clamp(local.y, -hy, hy)
          const ddx = local.x - px
          const ddy = local.y - py
          const d = Math.hypot(ddx, ddy)
          if (d >= r) continue
          nx = ddx / d
          ny = ddy / d
          pen = r - d
        }
        n = body.getWorldVector(pl.Vec2(nx, ny))
        point = body.getWorldPoint(pl.Vec2(px, py))
      } else {
        const rr = prop.shape.r * S
        const centre = body.getPosition()
        const dx = c.x - centre.x
        const dy = c.y - centre.y
        const d = Math.hypot(dx, dy)
        if (d >= rr + r) continue
        n = d > 1e-6 ? pl.Vec2(dx / d, dy / d) : pl.Vec2(0, -1)
        pen = rr + r - d
        point = pl.Vec2(centre.x + n.x * rr, centre.y + n.y * rr)
      }

      // 1. push the ball out of the prop
      ball.x += (n.x * pen) / S
      ball.y += (n.y * pen) / S

      // 2. bounce: closing speed along the normal, relative to how the prop is moving at that point
      const vp = body.getLinearVelocityFromWorldPoint(point)
      const vn = (ball.vx * S - vp.x) * n.x + (ball.vy * S - vp.y) * n.y
      if (vn >= 0) continue
      const dynamic = body.isDynamic()
      let invProp = 0
      if (dynamic) {
        const com = body.getWorldCenter()
        const lever = (point.x - com.x) * n.y - (point.y - com.y) * n.x
        // a body that cannot rotate (a balloon) has no inertia: it takes only the linear part
        // (dividing by it gave Infinity — balls could not push balloons — or NaN for a dead-centre hit)
        const inertia = body.getInertia()
        invProp = 1 / body.getMass() + (inertia > 1e-9 ? (lever * lever) / inertia : 0)
      }
      const j = (-(1 + COUPLING.restitution) * vn) / (1 / mb + invProp)
      if (!Number.isFinite(j)) continue // never let a NaN into the physics world
      ball.vx += (j / mb / S) * n.x
      ball.vy += (j / mb / S) * n.y
      if (dynamic) body.applyLinearImpulse(pl.Vec2(-j * n.x, -j * n.y), point, true)
      if (-vn >= COUPLING.minHitSpeed)
        hits.push({ prop, speed: -vn, x: point.x / S, y: point.y / S })
    }
  }
  return hits
}
