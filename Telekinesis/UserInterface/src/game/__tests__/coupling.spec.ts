import { describe, expect, it } from 'vitest'
import { Swarm, type SwarmInput } from '../swarm'
import { PHYS, PhysicsWorld, type Prop } from '../physics'
import { couple } from '../coupling'

const W = 6875
const H = 4375
const FLOOR = H - 110
const C = 120
const NO = { x: 0, y: 0 }
const input = (pose: SwarmInput['pose'], dir = NO): SwarmInput => ({
  present: true,
  pose,
  dir,
  pinch: 0,
  drift: NO,
  reach: 0.5,
  stop: false,
})

/** one frame of the whole thing, in the order the game runs it */
function frame(sw: Swarm, p: PhysicsWorld, inp: SwarmInput, dt = 1 / 60) {
  sw.step(dt, inp)
  const hits = couple(sw, p)
  p.step(dt)
  return hits
}
const settle = (sw: Swarm, p: PhysicsWorld, seconds = 3) => {
  for (let t = 0; t < seconds; t += 1 / 60) frame(sw, p, input('open'))
}
/** put the whole swarm at height y (world units), at rest relative to the floor, ready to fly */
const lowerTo = (sw: Swarm, y: number) =>
  sw.balls.forEach((b, i) => {
    b.y = y + ((i % 6) - 2.5) * 22
    b.vx = 0
    b.vy = 0
  })
const crate = (p: PhysicsWorld, x: number, y: number) =>
  p.addBox('crate', x, y, C / 2, C / 2, { density: 1.4, friction: 0.35 })
const tower = (p: PhysicsWorld, x: number) => {
  const cs: Prop[] = []
  for (let r = 0; r < 10; r++)
    for (const dx of [-61, 61]) cs.push(crate(p, x + dx, FLOOR - C / 2 - r * (C + 1)))
  return cs
}
const displaced = (p: PhysicsWorld, cs: Prop[], home: { x: number; y: number }[]) =>
  cs.filter((c, i) => Math.abs(p.pos(c).x - home[i]!.x) > 250).length
const comet = (sw: Swarm, p: PhysicsWorld, seconds: number) => {
  let peak = 0
  for (let t = 0; t < seconds; t += 1 / 60) {
    frame(sw, p, input('point', { x: 1, y: 0 }))
    for (const q of p.props) peak = Math.max(peak, p.speed(q) * PHYS.scale)
  }
  return peak
}

describe('coupling: the swarm and the props touch', () => {
  it('a ball cannot pass through a crate, however fast it is fired', () => {
    const sw = new Swarm(W, H)
    const p = new PhysicsWorld(W, H, FLOOR)
    const c = crate(p, 3000, FLOOR - 400)
    c.body.setType('static')
    const ball = sw.balls[0]!
    sw.balls.slice(1).forEach((b) => (b.x = 100)) // out of the way
    ball.x = 2400
    ball.y = FLOOR - 400
    ball.vx = 6000
    ball.vy = 0
    ball.lev = 1
    for (let i = 0; i < 90; i++) {
      frame(sw, p, input('open'))
      const inside = Math.abs(ball.x - 3000) < C / 2 && Math.abs(ball.y - (FLOOR - 400)) < C / 2
      expect(inside, `frame ${i}`).toBe(false)
    }
    expect(ball.x).toBeLessThan(3000) // it bounced back, it did not tunnel through
  })

  it('a ball whose centre ends up inside a box is pushed out through the nearest face', () => {
    const sw = new Swarm(W, H)
    const p = new PhysicsWorld(W, H, FLOOR)
    const c = crate(p, 3000, FLOOR - 400)
    c.body.setType('static')
    sw.balls.forEach((b) => (b.x = 100))
    const ball = sw.balls[0]!
    ball.x = 3030 // 30 units right of the centre: nearest face is the right one
    ball.y = FLOOR - 400
    ball.lev = 1
    couple(sw, p)
    expect(ball.x).toBeGreaterThanOrEqual(3000 + C / 2 + sw.radius - 1)
    expect(Math.abs(ball.y - (FLOOR - 400))).toBeLessThan(2)
  })

  it('the same for a round prop (a boulder)', () => {
    const sw = new Swarm(W, H)
    const p = new PhysicsWorld(W, H, FLOOR)
    const b = p.addCircle('boulder', 3000, FLOOR - 400, 90, { static: true })
    sw.balls.forEach((x) => (x.x = 100))
    const ball = sw.balls[0]!
    ball.x = 3000
    ball.y = FLOOR - 400 - 40 // inside, a little above the centre
    ball.lev = 1
    couple(sw, p)
    expect(Math.hypot(ball.x - 3000, ball.y - (FLOOR - 400))).toBeGreaterThanOrEqual(
      90 + sw.radius - 1,
    )
    expect(b.alive).toBe(true)
  })

  it('a comet knocks a lone crate over with a proper whack — fast, but not absurdly so', () => {
    const sw = new Swarm(W, H)
    const p = new PhysicsWorld(W, H, FLOOR)
    const c = crate(p, W / 2 + 1500, FLOOR - C / 2)
    settle(sw, p)
    lowerTo(sw, FLOOR - 60)
    const x0 = p.pos(c).x
    const peak = comet(sw, p, 2.5)
    expect(p.pos(c).x - x0).toBeGreaterThan(250)
    expect(peak).toBeGreaterThan(4) // m/s
    expect(peak).toBeLessThan(30)
  })

  it('a heavy boulder moves less than a crate under the same comet', () => {
    const run = (make: (p: PhysicsWorld) => Prop) => {
      const sw = new Swarm(W, H)
      const p = new PhysicsWorld(W, H, FLOOR)
      make(p)
      settle(sw, p)
      lowerTo(sw, FLOOR - 70)
      return comet(sw, p, 2.5)
    }
    const crateSpeed = run((p) => crate(p, W / 2 + 1500, FLOOR - C / 2))
    const boulderSpeed = run((p) =>
      p.addCircle('boulder', W / 2 + 1500, FLOOR - 90, 90, { density: 6 }),
    )
    expect(boulderSpeed).toBeLessThan(crateSpeed * 0.7)
    expect(boulderSpeed).toBeGreaterThan(1) // …but it does move
  })

  it('props push the balls back: a crate sliding into resting balls sends them along', () => {
    const sw = new Swarm(W, H)
    const p = new PhysicsWorld(W, H, FLOOR)
    for (let t = 0; t < 2; t += 1 / 60) frame(sw, p, input('fist'))
    const c = crate(p, sw.centroid().x - 500, FLOOR - C / 2)
    c.body.setLinearVelocity({ x: 18, y: 0 }) // 18 m/s to the right (friction stops it after ~16 m, the heap is 5 m away)
    const vxBefore = sw.balls.reduce((a, b) => a + b.vx, 0) / sw.balls.length
    let best = 0
    for (let t = 0; t < 1.5; t += 1 / 60) {
      frame(sw, p, input('fist'))
      best = Math.max(best, sw.balls.reduce((a, b) => a + b.vx, 0) / sw.balls.length)
    }
    expect(best).toBeGreaterThan(vxBefore + 50)
    expect(Number.isFinite(sw.centroid().x)).toBe(true)
  })

  it('an off-centre hit makes a crate spin, not only slide', () => {
    const sw = new Swarm(W, H)
    const p = new PhysicsWorld(W, H, FLOOR)
    const tall = p.addBox('crate', W / 2 + 1500, FLOOR - 200, 40, 200, {
      density: 1.4,
      friction: 0.35,
    })
    settle(sw, p)
    lowerTo(sw, FLOOR - 380) // near the top of a tall box
    let spin = 0
    for (let t = 0; t < 3; t += 1 / 60) {
      frame(sw, p, input('point', { x: 1, y: 0 }))
      spin = Math.max(spin, Math.abs(tall.body.getAngularVelocity()))
    }
    expect(spin).toBeGreaterThan(0.5)
  })

  it('a tower stands untouched with the swarm resting against it, then topples when hit', () => {
    const sw = new Swarm(W, H)
    const p = new PhysicsWorld(W, H, FLOOR)
    const cs = tower(p, W / 2 + 1500)
    const home = cs.map((c) => ({ ...p.pos(c) }))
    settle(sw, p, 3)
    expect(displaced(p, cs, home)).toBe(0) // calm
    lowerTo(sw, FLOOR - 750) // aim high on the tower: leverage
    comet(sw, p, 2.5)
    for (let t = 0; t < 3; t += 1 / 60) frame(sw, p, input('open'))
    expect(displaced(p, cs, home)).toBeGreaterThanOrEqual(12) // the goal of the Wrecking Ball stage
  })

  it('a low hit knocks fewer crates down than a high one (leverage)', () => {
    const topple = (y: number) => {
      const sw = new Swarm(W, H)
      const p = new PhysicsWorld(W, H, FLOOR)
      const cs = tower(p, W / 2 + 1500)
      const home = cs.map((c) => ({ ...p.pos(c) }))
      settle(sw, p, 3)
      lowerTo(sw, y)
      comet(sw, p, 2.5)
      for (let t = 0; t < 3; t += 1 / 60) frame(sw, p, input('open'))
      return displaced(p, cs, home)
    }
    const low = topple(FLOOR - 200)
    const high = topple(FLOOR - 750)
    expect(low).toBeGreaterThan(2)
    expect(high).toBeGreaterThanOrEqual(low)
  })

  it('a pyramid is sturdy: a low comet does not bring it down', () => {
    const sw = new Swarm(W, H)
    const p = new PhysicsWorld(W, H, FLOOR)
    const cs: Prop[] = []
    for (let r = 0; r < 7; r++)
      for (let j = 0; j < 7 - r; j++)
        cs.push(crate(p, W / 2 + 1700 + (j - (6 - r) / 2) * (C + 2), FLOOR - C / 2 - r * (C + 1)))
    const home = cs.map((c) => ({ ...p.pos(c) }))
    settle(sw, p, 3)
    lowerTo(sw, FLOOR - 200)
    comet(sw, p, 2.5)
    expect(displaced(p, cs, home)).toBeLessThan(5)
  })

  it('hits are reported with a sensible closing speed: a drifting brush is slow, a comet head is fast', () => {
    const slow = new Swarm(W, H)
    const pSlow = new PhysicsWorld(W, H, FLOOR)
    const c1 = crate(pSlow, 3000, FLOOR - 400)
    c1.body.setType('static')
    slow.balls.forEach((b) => (b.x = 100))
    const b1 = slow.balls[0]!
    Object.assign(b1, { x: 2800, y: FLOOR - 400, vx: 300, vy: 0, lev: 1 })
    let slowMax = 0
    for (let i = 0; i < 60; i++)
      for (const h of frame(slow, pSlow, input('open'))) slowMax = Math.max(slowMax, h.speed)
    expect(slowMax).toBeGreaterThan(1)
    expect(slowMax).toBeLessThan(5) // ≈ 3 m/s

    const fast = new Swarm(W, H)
    const pFast = new PhysicsWorld(W, H, FLOOR)
    const c2 = crate(pFast, 3000, FLOOR - 400)
    c2.body.setType('static')
    fast.balls.forEach((b) => (b.x = 100))
    Object.assign(fast.balls[0]!, { x: 2600, y: FLOOR - 400, vx: 3000, vy: 0, lev: 1 })
    let fastMax = 0
    let where = { x: 0, y: 0 }
    for (let i = 0; i < 60; i++)
      for (const h of frame(fast, pFast, input('open')))
        if (h.speed > fastMax) {
          fastMax = h.speed
          where = h
        }
    expect(fastMax).toBeGreaterThan(20)
    expect(Math.abs(where.x - (3000 - C / 2))).toBeLessThan(40) // reported where it touched (the left face)
  })

  it('resting balls pressed against a standing crate do not make it creep or jitter', () => {
    const sw = new Swarm(W, H)
    const p = new PhysicsWorld(W, H, FLOOR)
    const c = crate(p, sw.centroid().x + 60, FLOOR - C / 2) // right in the heap
    for (let t = 0; t < 3; t += 1 / 60) frame(sw, p, input('fist'))
    const at = p.pos(c)
    for (let t = 0; t < 3; t += 1 / 60) frame(sw, p, input('fist'))
    expect(Math.hypot(p.pos(c).x - at.x, p.pos(c).y - at.y)).toBeLessThan(8)
    expect(Number.isFinite(sw.centroid().x + sw.centroid().y)).toBe(true)
  })

  it('a ball can push a balloon (a body that cannot rotate has no inertia — that used to zero the impulse)', () => {
    const sw = new Swarm(W, H)
    const p = new PhysicsWorld(W, H, FLOOR)
    const anchor = p.addBox('anchor', 3000, FLOOR - 4, 4, 4, { static: true })
    const balloon = p.addCircle('balloon', 3000, FLOOR - 1000, 70, {
      density: 0.02,
      gravityScale: -0.3,
      linearDamping: 1.5,
      fixedRotation: true,
    })
    p.addRope(anchor, balloon, 1000)
    expect(balloon.body.getInertia()).toBe(0)
    sw.balls.forEach((b) => (b.x = 100))
    Object.assign(sw.balls[0]!, { x: 2800, y: FLOOR - 1000 + 20, vx: 250, vy: 0, lev: 1 }) // a gentle, drifting brush
    for (let i = 0; i < 90; i++) frame(sw, p, input('open'))
    expect(p.pos(balloon).x).toBeGreaterThan(3003) // it was pushed along
    expect(Number.isFinite(p.pos(balloon).x + p.pos(balloon).y)).toBe(true)
  })

  it('a dead-centre hit on a balloon is finite too (0 ÷ 0 must not poison the world)', () => {
    const sw = new Swarm(W, H)
    const p = new PhysicsWorld(W, H, FLOOR)
    const anchor = p.addBox('anchor', 3000, FLOOR - 4, 4, 4, { static: true })
    const balloon = p.addCircle('balloon', 3000, FLOOR - 1000, 70, {
      density: 0.02,
      gravityScale: -0.3,
      fixedRotation: true,
    })
    p.addRope(anchor, balloon, 1000)
    sw.balls.forEach((b) => (b.x = 100))
    Object.assign(sw.balls[0]!, { x: 2800, y: FLOOR - 1000, vx: 250, vy: 0, lev: 1 }) // exactly through the centre
    for (let i = 0; i < 120; i++) frame(sw, p, input('open'))
    const c = p.pos(balloon)
    expect(Number.isFinite(c.x + c.y)).toBe(true)
    expect(Number.isFinite(sw.balls[0]!.x + sw.balls[0]!.vx)).toBe(true)
  })

  it('is deterministic', () => {
    const go = () => {
      const sw = new Swarm(W, H)
      const p = new PhysicsWorld(W, H, FLOOR)
      const cs = tower(p, W / 2 + 1500)
      settle(sw, p, 2)
      lowerTo(sw, FLOOR - 600)
      comet(sw, p, 2)
      return cs.map((c) => p.pos(c))
    }
    expect(go()).toEqual(go())
  })
})
