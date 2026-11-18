import { describe, expect, it } from 'vitest'
import { Swarm, type Ball } from '../swarm'
import { PhysicsWorld } from '../physics'
import {
  DISTRACT,
  applyDistractors,
  fanOn,
  type Fan,
  type Lantern,
  type Whirlpool,
} from '../distractors'

const W = 6875
const H = 4375
const FLOOR = H - 110

/** a swarm whose balls are all floating, spread out on a grid around (cx, cy), motionless */
function floating(cx: number, cy: number, spread = 150) {
  const sw = new Swarm(W, H)
  sw.balls.forEach((b, i) => {
    b.x = cx + ((i % 10) - 4.5) * spread * 0.2
    b.y = cy + (Math.floor(i / 10) - 2.5) * spread * 0.2
    b.vx = 0
    b.vy = 0
    b.lev = 1
  })
  return sw
}
const world = () => new PhysicsWorld(W, H, FLOOR)
const noRecycle = () => {}
const meanDist = (sw: Swarm, p: { x: number; y: number }) =>
  sw.balls.reduce((a, b) => a + Math.hypot(b.x - p.x, b.y - p.y), 0) / sw.balls.length
/** integrate the velocities the distractors gave (no drag, no gravity: just their pull) */
function simulate(
  sw: Swarm,
  p: PhysicsWorld,
  ds: Parameters<typeof applyDistractors>[0],
  seconds: number,
  onRecycle: (b: Ball, i: number) => void = noRecycle,
) {
  let swallowed = 0
  for (let t = 0; t < seconds; t += 1 / 60) {
    swallowed += applyDistractors(ds, sw, p, t, 1 / 60, onRecycle)
    for (const b of sw.balls) {
      b.vx *= 1 - 0.6 / 60 // the air drag
      b.vy *= 1 - 0.6 / 60
      b.x += b.vx / 60
      b.y += b.vy / 60
    }
  }
  return swallowed
}

describe('lantern: moths to a flame', () => {
  const lantern: Lantern = { kind: 'lantern', x: 3000, y: 2000, radius: 900 }

  it('floating balls inside its radius are pulled in', () => {
    const sw = floating(3500, 2000) // 500 units to the right of it
    const before = meanDist(sw, lantern)
    simulate(sw, world(), [lantern], 1)
    expect(meanDist(sw, lantern)).toBeLessThan(before - 100)
  })

  it('and made to swirl round it, not just fall straight in', () => {
    const sw = floating(3500, 2000)
    simulate(sw, world(), [lantern], 1.2)
    const tangential = sw.balls.reduce((a, b) => {
      const dx = b.x - lantern.x
      const dy = b.y - lantern.y
      return a + (dx * b.vy - dy * b.vx) / Math.max(Math.hypot(dx, dy), 1)
    }, 0)
    expect(Math.abs(tangential)).toBeGreaterThan(100)
  })

  it('balls outside the radius are not touched at all', () => {
    const sw = floating(3000 + 1500, 2000)
    applyDistractors([lantern], sw, world(), 0, 1 / 60, noRecycle)
    sw.balls.forEach((b) => {
      expect(b.vx).toBe(0)
      expect(b.vy).toBe(0)
    })
  })

  it('resting balls (on the floor) never feel it, even right next to it', () => {
    const sw = floating(3300, 2000)
    sw.balls.forEach((b) => (b.lev = 0))
    applyDistractors([lantern], sw, world(), 0, 1 / 60, noRecycle)
    sw.balls.forEach((b) => expect(b.vx).toBe(0))
  })

  it('pulls harder the closer you are', () => {
    const near = floating(3000 + 200, 2000, 1)
    const far = floating(3000 + 700, 2000, 1)
    applyDistractors([lantern], near, world(), 0, 1 / 60, noRecycle)
    applyDistractors([lantern], far, world(), 0, 1 / 60, noRecycle)
    expect(Math.abs(near.balls[0]!.vx)).toBeGreaterThan(Math.abs(far.balls[0]!.vx) * 3)
  })

  it('is weaker than a comet push, so a determined player can pull away', () => {
    expect(DISTRACT.lanternPull).toBeLessThan(5000) // vs a comet head at ~1400–3000 u/s²·s… and drift 360 u/s²
  })
})

describe('fan: gusts on and off', () => {
  const fan: Fan = {
    kind: 'fan',
    x: 3000,
    y: 2000,
    w: 800,
    h: 600,
    dir: { x: 1, y: 0 },
    period: 5,
    onTime: 3,
    offset: 0,
  }

  it('blows for onTime of every period', () => {
    expect(fanOn(fan, 0)).toBe(true)
    expect(fanOn(fan, 2.9)).toBe(true)
    expect(fanOn(fan, 3.1)).toBe(false)
    expect(fanOn(fan, 4.9)).toBe(false)
    expect(fanOn(fan, 5.1)).toBe(true) // next cycle
    expect(fanOn({ ...fan, offset: 3.5 }, 0)).toBe(false) // an offset shifts the cycle: it can start off…
    expect(fanOn({ ...fan, offset: 3.5 }, 1.4)).toBe(false)
    expect(fanOn({ ...fan, offset: 3.5 }, 1.6)).toBe(true) // …and come on later
  })

  it('pushes floating balls inside its zone along its direction while on', () => {
    const sw = floating(3000, 2000, 100)
    applyDistractors([fan], sw, world(), 0, 1 / 60, noRecycle)
    sw.balls.forEach((b) => {
      expect(b.vx).toBeCloseTo((DISTRACT.fanAccel * 1) / 60, 6)
      expect(b.vy).toBe(0)
    })
  })

  it('does nothing while off, or to balls outside the zone', () => {
    const off = floating(3000, 2000, 100)
    applyDistractors([fan], off, world(), 4, 1 / 60, noRecycle) // t = 4: off
    off.balls.forEach((b) => expect(b.vx).toBe(0))
    const outside = floating(3000 + 1500, 2000, 100)
    applyDistractors([fan], outside, world(), 0, 1 / 60, noRecycle)
    outside.balls.forEach((b) => expect(b.vx).toBe(0))
  })

  it('bends a balloon in its zone, but leaves crates alone', () => {
    const p = world()
    const anchor = p.addBox('anchor', 3000, FLOOR - 5, 5, 5, { static: true })
    const balloon = p.addCircle('balloon', 3000, 2000, 70, {
      density: 0.02,
      gravityScale: 0,
      fixedRotation: true,
    })
    p.addRope(anchor, balloon, 3000)
    const crate = p.addBox('crate', 3000, 1800, 60, 60, { density: 1.4 }) // in the zone, clear of the balloon
    crate.body.setGravityScale(0)
    const sw = floating(100, 100) // the balls are elsewhere
    for (let t = 0; t < 1; t += 1 / 60) {
      applyDistractors([fan], sw, p, 0, 1 / 60, noRecycle) // keep it blowing
      p.step(1 / 60)
    }
    expect(balloon.body.getLinearVelocity().x).toBeGreaterThan(1) // blown along
    expect(Math.abs(crate.body.getLinearVelocity().x)).toBeLessThan(0.01) // untouched
  })
})

describe('whirlpool: pulls, swirls, swallows and spits balls back out at the start', () => {
  const pool: Whirlpool = { kind: 'whirlpool', x: 3000, y: 2500, radius: 800, core: 90 }

  it('pulls floating balls in and swirls them', () => {
    const sw = floating(3500, 2500)
    const before = meanDist(sw, pool)
    simulate(sw, world(), [pool], 0.6)
    expect(meanDist(sw, pool)).toBeLessThan(before - 80)
    const tangential = sw.balls.reduce((a, b) => {
      const dx = b.x - pool.x
      const dy = b.y - pool.y
      return a + (dx * b.vy - dy * b.vx) / Math.max(Math.hypot(dx, dy), 1)
    }, 0)
    expect(Math.abs(tangential)).toBeGreaterThan(100)
  })

  it('a ball that reaches the core is recycled exactly once, and nothing else is', () => {
    const sw = floating(3000 + 700, 2500)
    const swallowed: number[] = []
    sw.balls[7]!.x = pool.x + 30 // one ball sits in the core
    sw.balls[7]!.y = pool.y
    const n = applyDistractors([pool], sw, world(), 0, 1 / 60, (_b, i) => swallowed.push(i))
    expect(n).toBe(1)
    expect(swallowed).toEqual([7])
  })

  it('swallowing keeps the swarm at 60 balls (the caller moves the ball, nothing is deleted)', () => {
    const sw = floating(3000 + 300, 2500)
    simulate(sw, world(), [pool], 6, (b) => {
      b.x = W / 2
      b.y = sw.floorY
      b.vx = 0
      b.vy = 0
      b.lev = 0
    })
    expect(sw.balls).toHaveLength(60)
    sw.balls.forEach((b) => {
      expect(Number.isFinite(b.x + b.y)).toBe(true)
      expect(b.x).toBeGreaterThan(0)
      expect(b.x).toBeLessThan(W)
    })
  })

  it('props are not affected (the whirlpool only works on the swarm)', () => {
    const p = world()
    const crate = p.addBox('crate', 3050, 2500, 60, 60, { density: 1.4 })
    crate.body.setGravityScale(0)
    const sw = floating(100, 100)
    for (let t = 0; t < 1; t += 1 / 60) {
      applyDistractors([pool], sw, p, t, 1 / 60, noRecycle)
      p.step(1 / 60)
    }
    expect(Math.abs(crate.body.getLinearVelocity().x)).toBeLessThan(0.01)
    expect(Math.abs(crate.body.getLinearVelocity().y)).toBeLessThan(0.01)
  })

  it('resting balls are never swallowed', () => {
    const sw = floating(3030, 2500, 20)
    sw.balls.forEach((b) => (b.lev = 0))
    expect(applyDistractors([pool], sw, world(), 0, 1 / 60, noRecycle)).toBe(0)
  })
})
