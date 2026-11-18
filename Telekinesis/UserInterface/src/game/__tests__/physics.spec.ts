import { describe, expect, it } from 'vitest'
import { PHYS, PhysicsWorld } from '../physics'

const W = 6875
const H = 4375
const FLOOR = H - 110 // the top of the floor (the swarm's floorY + its radius)
const C = 120 // crate side

const run = (p: PhysicsWorld, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) p.step(1 / 60)
}
const world = () => new PhysicsWorld(W, H, FLOOR)

describe('PhysicsWorld', () => {
  it('a crate dropped from above lands on the floor line and goes to sleep there', () => {
    const p = world()
    const crate = p.addBox('crate', 3000, FLOOR - 1000, C / 2, C / 2, { density: 3 })
    run(p, 3)
    expect(p.pos(crate).y).toBeGreaterThan(FLOOR - C / 2 - 6) // sitting on the floor (a few units of solver slop)
    expect(p.pos(crate).y).toBeLessThan(FLOOR - C / 2 + 1)
    expect(crate.body.isAwake()).toBe(false)
    expect(p.speed(crate)).toBeLessThan(0.5)
  })

  it('a tower of crates stands perfectly still for 3 s', () => {
    const p = world()
    const crates = Array.from({ length: 10 }, (_, i) =>
      p.addBox('crate', 3000, FLOOR - C / 2 - i * (C + 1), C / 2, C / 2, { density: 3 }),
    )
    run(p, 2) // settle
    const before = crates.map((c) => p.pos(c))
    run(p, 3)
    crates.forEach((c, i) => {
      const q = p.pos(c)
      expect(Math.hypot(q.x - before[i]!.x, q.y - before[i]!.y), `crate ${i}`).toBeLessThan(2)
      expect(p.speed(c)).toBeLessThan(1)
    })
    expect(Math.abs(p.pos(crates[9]!).x - 3000)).toBeLessThan(15) // and it has not leaned over
  })

  it('reports an impact whose speed ≈ the speed it hit the floor at, and stays quiet once it rests', () => {
    const p = world()
    p.addBox('crate', 3000, FLOOR - 1100, C / 2, C / 2, { density: 3, restitution: 0 })
    run(p, 3)
    const hits = p.drainImpacts()
    const hit = hits.reduce((m, h) => (h.speed > m.speed ? h : m), hits[0]!)
    const expected = Math.sqrt(2 * PHYS.gravity * 10) // fell ~10 m
    expect(hit.speed).toBeGreaterThan(expected * 0.6)
    expect(hit.speed).toBeLessThan(expected * 1.3)
    expect(hit.y).toBeGreaterThan(FLOOR - 200) // reported where it happened (world units)
    run(p, 3)
    expect(p.drainImpacts()).toHaveLength(0) // a resting contact is not a hit
  })

  it('a balloon on a rope floats up until the rope is taut and then hangs there, calmly', () => {
    const p = world()
    const anchor = p.addBox('anchor', 3000, FLOOR - 5, 5, 5, { static: true })
    const balloon = p.addCircle('balloon', 3000, FLOOR - 120, 70, {
      density: 0.02,
      gravityScale: -0.3,
      linearDamping: 1.5,
      fixedRotation: true,
    })
    p.addRope(anchor, balloon, 1200, { x: 0, y: 70 })
    run(p, 6)
    const top = p.tiePoint(balloon)
    expect(Math.hypot(top.x - 3000, top.y - (FLOOR - 5))).toBeGreaterThan(1150) // rope taut: ~1200 long
    expect(Math.hypot(top.x - 3000, top.y - (FLOOR - 5))).toBeLessThan(1230)
    expect(p.pos(balloon).y).toBeLessThan(FLOOR - 1000) // way up in the air
    expect(p.speed(balloon)).toBeLessThan(30) // not jittering
  })

  it('removing a roped prop also removes the rope; removing twice is harmless', () => {
    const p = world()
    const anchor = p.addBox('anchor', 3000, FLOOR - 5, 5, 5, { static: true })
    const balloon = p.addCircle('balloon', 3000, FLOOR - 300, 70, {
      density: 0.02,
      gravityScale: -0.3,
    })
    p.addRope(anchor, balloon, 800)
    expect(p.world.getJointCount()).toBe(1)
    p.remove(balloon)
    p.remove(balloon)
    expect(p.world.getJointCount()).toBe(0)
    expect(p.props).not.toContain(balloon)
    expect(balloon.alive).toBe(false)
    run(p, 1) // the world still steps
  })

  it('a rod makes a pendulum: the length never changes as it swings', () => {
    const p = world()
    const anchor = p.addBox('anchor', 3000, FLOOR - 2000, 5, 5, { static: true })
    const ball = p.addCircle('wreck', 3000 + 1500, FLOOR - 2000, 100, { density: 8 })
    p.addRod(anchor, ball, 1500)
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < 60 * 8; i++) {
      p.step(1 / 60)
      const q = p.pos(ball)
      const len = Math.hypot(q.x - 3000, q.y - (FLOOR - 2000))
      lo = Math.min(lo, len)
      hi = Math.max(hi, len)
    }
    expect(lo).toBeGreaterThan(1495)
    expect(hi).toBeLessThan(1505)
  })

  it('things cannot leave through the side walls or the floor', () => {
    const p = world()
    const crate = p.addBox('crate', 500, FLOOR - 200, C / 2, C / 2, { density: 3 })
    crate.body.setLinearVelocity({ x: -5000 * PHYS.scale, y: 0 })
    const boulder = p.addCircle('boulder', W - 500, FLOOR - 200, 90, { density: 6 })
    boulder.body.setLinearVelocity({ x: 8000 * PHYS.scale, y: 0 })
    run(p, 3)
    expect(p.pos(crate).x).toBeGreaterThan(0)
    expect(p.pos(boulder).x).toBeLessThan(W)
    expect(p.pos(boulder).y).toBeLessThan(FLOOR)
  })

  it('is deterministic: the same steps give the same positions', () => {
    const make = () => {
      const p = world()
      const cs = Array.from({ length: 6 }, (_, i) =>
        p.addBox('crate', 3000 + (i % 2) * 20, FLOOR - 200 - i * 130, C / 2, C / 2, { density: 3 }),
      )
      run(p, 4)
      return cs.map((c) => p.pos(c))
    }
    expect(make()).toEqual(make())
  })

  it('a huge frame time is clamped (slowed, never exploded)', () => {
    const p = world()
    const crate = p.addBox('crate', 3000, FLOOR - 300, C / 2, C / 2, { density: 3 })
    p.step(30) // a 30 s hiccup
    expect(p.time).toBeLessThan(PHYS.step * PHYS.maxSteps + 1e-6)
    run(p, 3)
    expect(Number.isFinite(p.pos(crate).x + p.pos(crate).y)).toBe(true)
    expect(p.pos(crate).y).toBeLessThan(FLOOR)
  })

  it('destroy() frees every body', () => {
    const p = world()
    const anchor = p.addBox('anchor', 3000, FLOOR - 5, 5, 5, { static: true })
    const b = p.addCircle('balloon', 3000, FLOOR - 300, 70, { density: 0.02 })
    p.addRope(anchor, b, 800)
    p.addBox('crate', 2000, FLOOR - 100, C / 2, C / 2)
    p.destroy()
    expect(p.props).toHaveLength(0)
    expect(p.world.getJointCount()).toBe(0)
    expect(p.world.getBodyCount()).toBe(3) // only the ground and the two walls are left
  })
})
