import { describe, expect, it } from 'vitest'
import { Swarm, type SwarmInput } from '../swarm'

const W = 3400
const H = 2200
const NO = { x: 0, y: 0 }
const none: SwarmInput = {
  present: false,
  pose: 'none',
  dir: NO,
  pinch: 0,
  drift: NO,
  reach: 0.5,
  stop: false,
}
const hand = (pose: SwarmInput['pose'], pinch = 0): SwarmInput => ({
  present: true,
  pose,
  dir: NO,
  pinch,
  drift: NO,
  reach: 0.5,
  stop: false,
})
const wave = (
  x: number,
  y: number,
  pose: SwarmInput['pose'] = 'open',
  reach = 0.5,
): SwarmInput => ({
  present: true,
  pose,
  dir: NO,
  pinch: 0,
  drift: { x, y },
  reach,
  stop: false,
})
const point = (x: number, y: number, reach = 0.5): SwarmInput => ({
  present: true,
  pose: 'point',
  dir: { x, y },
  pinch: 0,
  drift: NO,
  reach,
  stop: false,
})

function run(s: Swarm, seconds: number, input: SwarmInput) {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) s.step(1 / 60, input)
}
const mean = (s: Swarm, f: (b: Swarm['balls'][number]) => number) =>
  s.balls.reduce((a, b) => a + f(b), 0) / s.balls.length
const meanRadius = (s: Swarm) => {
  const c = s.centroid()
  return mean(s, (b) => Math.hypot(b.x - c.x, b.y - c.y))
}
/** mean angular velocity (rad/s) around the swarm's own average point */
const meanOmega = (s: Swarm) => {
  const c = s.centroid()
  return mean(s, (b) => {
    const dx = b.x - c.x
    const dy = b.y - c.y
    return (dx * (b.vy - c.vy) - dy * (b.vx - c.vx)) / Math.max(dx * dx + dy * dy, 1)
  })
}
const headBall = (s: Swarm, dir: { x: number; y: number }) => {
  const c = s.centroid()
  return s.balls.reduce(
    (m, b) =>
      (b.x - c.x) * dir.x + (b.y - c.y) * dir.y > (m.x - c.x) * dir.x + (m.y - c.y) * dir.y ? b : m,
    s.balls[0]!,
  )
}
const speed = (s: Swarm) => {
  const c = s.centroid()
  return Math.hypot(c.vx, c.vy)
}

describe('resting', () => {
  it('settles on the floor under gravity', () => {
    const s = new Swarm(W, H)
    run(s, 3, none)
    for (const b of s.balls) {
      expect(b.y).toBeLessThanOrEqual(s.floorY + 0.01)
      expect(b.y).toBeGreaterThan(s.floorY - s.radius * 14)
    }
    expect(s.hovering).toBe(0)
  })

  it('balls do not stay overlapped on the floor', () => {
    const s = new Swarm(W, H)
    run(s, 3, none)
    let worst = 0
    for (let i = 0; i < s.balls.length; i++)
      for (let j = i + 1; j < s.balls.length; j++)
        worst = Math.max(
          worst,
          2 * s.radius - Math.hypot(s.balls[i]!.x - s.balls[j]!.x, s.balls[i]!.y - s.balls[j]!.y),
        )
    expect(worst).toBeLessThan(s.radius * 0.6)
  })
})

describe('open palm = gravity off', () => {
  it('from the floor the balls get a small random kick up, then just float (no gravity, no automatic gathering)', () => {
    const s = new Swarm(W, H)
    run(s, 2, none)
    const before = s.centroid()
    run(s, 0.2, hand('open'))
    expect(s.centroid().vy).toBeLessThan(-50) // the kick: the swarm "woke up"
    const ups = s.balls.filter((b) => b.vy < -30).length
    expect(ups).toBeGreaterThan(s.balls.length * 0.3)
    run(s, 4, hand('open'))
    const c = s.centroid()
    expect(s.mode).toBe('levitate')
    expect(s.hovering).toBeGreaterThan(0.95)
    expect(before.y - c.y).toBeGreaterThan(30) // rose a little…
    expect(before.y - c.y).toBeLessThan(500) // …only a little
    expect(Math.abs(c.x - before.x)).toBeLessThan(60)
    expect(speed(s)).toBeLessThan(15)
  })

  it('then it stays where it floats: it does not fall back down', () => {
    const s = new Swarm(W, H)
    run(s, 5, hand('open'))
    const y = s.centroid().y
    run(s, 4, hand('open'))
    expect(Math.abs(s.centroid().y - y)).toBeLessThan(25)
    expect(y).toBeLessThan(s.floorY - 20)
  })

  it('keeps its velocity and only the air drag slows it down (no braking, no hold)', () => {
    const s = new Swarm(12000, 6000) // big enough that the coast never reaches a wall
    run(s, 4, hand('open'))
    run(s, 1.4, point(1, 0))
    const v0 = s.centroid().vx
    const x0 = s.centroid().x
    expect(v0).toBeGreaterThan(200)
    run(s, 0.2, hand('open'))
    expect(s.centroid().vx).toBeGreaterThan(v0 * 0.8) // still moving at pace
    let prev = s.centroid().vx
    let sharpestDrop = 0
    let still = 0
    for (let i = 0; i < 720; i++) {
      s.step(1 / 60, hand('open'))
      const vx = s.centroid().vx
      sharpestDrop = Math.max(sharpestDrop, prev - vx)
      prev = vx
      if (i === 240) still = vx
    }
    expect(s.centroid().vx).toBeLessThan(v0 * 0.05) // drag has stopped it in the end (≈ 12 s with the light air drag)
    expect(still).toBeLessThan(v0) // slowing down on the way
    expect(sharpestDrop).toBeLessThan(40) // a smooth fade, never a sudden stop
    expect(s.centroid().x - x0).toBeGreaterThan((v0 / 0.6) * 0.6) // and it coasted a long way (~ v / drag, drag = 0.6)
    expect(s.mode).toBe('levitate')
  })

  it('neither clumps nor spreads by itself', () => {
    const s = new Swarm(W, H)
    run(s, 4, hand('open'))
    const r0 = meanRadius(s)
    run(s, 6, hand('open'))
    expect(meanRadius(s)).toBeGreaterThan(r0 * 0.85)
    expect(meanRadius(s)).toBeLessThan(r0 * 1.15)
  })

  it('keeps floating when tracking is lost', () => {
    const s = new Swarm(W, H)
    run(s, 4, hand('open'))
    const y = s.centroid().y
    run(s, 2, none)
    expect(s.mode).toBe('levitate')
    expect(Math.abs(s.centroid().y - y)).toBeLessThan(25)
  })

  it('fist drops the swarm (gravity back on); open palm lets it float again', () => {
    const s = new Swarm(W, H)
    run(s, 4, hand('open'))
    run(s, 4, hand('fist'))
    expect(s.mode).toBe('rest')
    expect(s.hovering).toBe(0)
    expect(s.centroid().y).toBeGreaterThan(s.floorY - s.radius * 14)
    run(s, 0.2, hand('open'))
    expect(s.centroid().vy).toBeLessThan(-50) // kicked again
    run(s, 3, hand('open'))
    expect(s.hovering).toBeGreaterThan(0.95)
  })

  it('a fist keeps the momentum: the balls fall with the speed they had', () => {
    const s = new Swarm(W, H)
    run(s, 4, hand('open'))
    run(s, 1.4, point(1, 0))
    const vx = s.centroid().vx
    run(s, 0.1, hand('fist'))
    expect(s.centroid().vx).toBeGreaterThan(vx * 0.5)
    expect(s.hovering).toBeLessThan(1)
  })
})

describe('open palm + a moving hand: random balls drift slowly the way the hand moves', () => {
  const floating = () => {
    const s = new Swarm(W, H)
    run(s, 5, hand('open'))
    return s
  }
  const frac = (s: Swarm, f: (b: Swarm['balls'][number]) => boolean) =>
    s.balls.filter(f).length / s.balls.length

  it('the swarm drifts in the direction the hand moves, slowly', () => {
    const s = floating()
    const x0 = s.centroid().x
    run(s, 3, wave(1, 0))
    const dx = s.centroid().x - x0
    expect(dx).toBeGreaterThan(80)
    expect(dx).toBeLessThan(900) // slow: well under the pointing speeds
    expect(Math.abs(s.centroid().y - s.centroid().y)).toBeLessThan(1)
    // no ball is ever flung: the drift's terminal speed is only ~300 units/s
    for (const b of s.balls) expect(Math.hypot(b.vx, b.vy)).toBeLessThan(600)
  })

  it('only random balls follow, and which ones changes over time', () => {
    const s = floating()
    run(s, 2.5, wave(1, 0))
    const movingNow = (b: Swarm['balls'][number]) => b.vx > 80
    const f1 = frac(s, movingNow)
    expect(f1).toBeGreaterThan(0.15)
    expect(f1).toBeLessThan(0.9) // not everyone
    const first = new Set(s.balls.filter(movingNow))
    run(s, 4, wave(1, 0))
    const later = s.balls.filter(movingNow)
    expect(later.some((b) => !first.has(b))).toBe(true) // a different set is picked later
  })

  it('follows the hand direction (up-left, down, …)', () => {
    for (const [x, y] of [
      [-0.7, -0.7],
      [0, 1],
      [0.6, -0.8],
    ] as const) {
      const s = floating()
      const c0 = s.centroid()
      run(s, 3, wave(x, y))
      const c1 = s.centroid()
      const d = Math.hypot(x, y)
      const along = ((c1.x - c0.x) * x + (c1.y - c0.y) * y) / d
      const across = Math.abs(((c1.x - c0.x) * y - (c1.y - c0.y) * x) / d)
      expect(along, `${x},${y}`).toBeGreaterThan(60)
      expect(across, `${x},${y}`).toBeLessThan(along * 0.5)
    }
  })

  it('a faster hand drifts more; jitter below the dead zone does nothing', () => {
    const slow = floating()
    const fast = floating()
    const still = floating()
    run(slow, 3, wave(0.45, 0))
    run(fast, 3, wave(1.2, 0))
    run(still, 3, wave(0.15, 0.1)) // hand jitter
    const x0 = floating().centroid().x
    expect(fast.centroid().x - x0).toBeGreaterThan(slow.centroid().x - x0)
    expect(slow.centroid().x - x0).toBeGreaterThan(still.centroid().x - x0 + 20)
    expect(Math.abs(still.centroid().x - x0)).toBeLessThan(25)
  })

  it('the closer the hand, the more it affects: more balls follow, and faster', () => {
    const far = floating()
    const mid = floating()
    const near = floating()
    const x0 = floating().centroid().x
    run(far, 3, wave(1, 0, 'open', 0))
    run(mid, 3, wave(1, 0, 'open', 0.5))
    run(near, 3, wave(1, 0, 'open', 1))
    const dFar = far.centroid().x - x0
    const dMid = mid.centroid().x - x0
    const dNear = near.centroid().x - x0
    expect(dFar).toBeGreaterThan(0) // a far hand still has a little effect…
    expect(dMid).toBeGreaterThan(dFar * 2)
    expect(dNear).toBeGreaterThan(dMid * 1.4)
    const movers = (s: Swarm) => frac(s, (b) => b.vx > 60)
    expect(movers(near)).toBeGreaterThan(movers(far) + 0.2) // …on fewer balls
    // even the closest hand only drifts the balls, it never flings them
    for (const b of near.balls) expect(Math.hypot(b.vx, b.vy)).toBeLessThan(1400)
  })

  it('a missing / invalid reach falls back to the middle distance', () => {
    const a = floating()
    const b = floating()
    run(a, 3, wave(1, 0, 'open', 0.5))
    run(b, 3, wave(1, 0, 'open', Number.NaN))
    expect(b.centroid().x).toBeCloseTo(a.centroid().x, 3)
  })

  it('when the hand stops the balls just coast and the air drag stops them (no hold, no braking)', () => {
    const s = floating()
    run(s, 3, wave(1, 0))
    const v0 = s.centroid().vx
    expect(v0).toBeGreaterThan(20)
    run(s, 0.2, hand('open'))
    expect(s.centroid().vx).toBeGreaterThan(v0 * 0.6) // still carrying on
    run(s, 6, hand('open'))
    expect(Math.abs(s.centroid().vx)).toBeLessThan(15)
  })

  it('only an open palm does it: pinch, a fist, two fingers and a lost hand ignore the motion', () => {
    for (const pose of ['pinch', 'two'] as const) {
      const s = floating()
      const x0 = s.centroid().x
      run(s, 3, wave(1, 0, pose))
      // two fingers circles in place, pinch pulls together: neither is a sideways drift
      expect(Math.abs(s.centroid().x - x0), pose).toBeLessThan(60)
    }
    const f = floating()
    run(f, 3, wave(1, 0, 'fist'))
    expect(f.mode).toBe('rest')
    const l = floating()
    const xl = l.centroid().x
    run(l, 3, {
      present: false,
      pose: 'none',
      dir: NO,
      pinch: 0,
      drift: { x: 1, y: 0 },
      reach: 0.5,
      stop: false,
    })
    expect(Math.abs(l.centroid().x - xl)).toBeLessThan(25)
  })

  it('waving an open hand while the balls lie on the floor lifts them (kick) and drifts them', () => {
    const s = new Swarm(W, H)
    run(s, 3, none)
    run(s, 3, wave(1, 0))
    expect(s.mode).toBe('levitate')
    expect(s.hovering).toBeGreaterThan(0.95)
  })
})

describe('pinch pulls the swarm together', () => {
  it('clumps toward the swarm middle when it is still, and lets go when released', () => {
    const s = new Swarm(W, H)
    run(s, 4, hand('open'))
    const c0 = s.centroid()
    const loose = meanRadius(s)
    run(s, 3, hand('pinch', 1))
    expect(s.mode).toBe('levitate') // the pinch pose itself doesn't change the mode
    const clump = meanRadius(s)
    expect(clump).toBeLessThan(loose * 0.55)
    const c1 = s.centroid()
    expect(Math.hypot(c1.x - c0.x, c1.y - c0.y)).toBeLessThan(40) // gathered around the middle
    // let go: nothing pushes the balls apart, the clump just stays where it is
    run(s, 1, hand('open'))
    expect(meanRadius(s)).toBeLessThan(clump * 1.15)
    run(s, 5, hand('open'))
    expect(meanRadius(s)).toBeLessThan(clump * 1.4)
    const c2 = s.centroid()
    expect(Math.hypot(c2.x - c1.x, c2.y - c1.y)).toBeLessThan(60)
  })

  it('balls may touch: a clump is as tight as the balls themselves allow (no minimum spacing force)', () => {
    const s = new Swarm(W, H)
    run(s, 4, hand('open'))
    run(s, 4, hand('pinch', 1))
    // nearest-neighbour distance is just the touching distance (2 radii), not some comfortable spacing
    let sum = 0
    for (const a of s.balls) {
      let best = Infinity
      for (const b of s.balls) if (a !== b) best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y))
      sum += best
    }
    expect(sum / s.balls.length).toBeLessThan(s.radius * 2.6)
  })

  it('a light pinch pulls lightly', () => {
    const a = new Swarm(W, H)
    const b = new Swarm(W, H)
    run(a, 4, hand('open'))
    run(b, 4, hand('open'))
    run(a, 2, hand('pinch', 0.3))
    run(b, 2, hand('pinch', 1))
    expect(meanRadius(a)).toBeGreaterThan(meanRadius(b))
  })

  it('does nothing to balls lying on the floor', () => {
    const a = new Swarm(W, H)
    const b = new Swarm(W, H)
    run(a, 5, none)
    run(b, 5, none)
    run(a, 2, none)
    run(b, 2, hand('pinch', 1))
    expect(Math.abs(meanRadius(a) - meanRadius(b))).toBeLessThan(3) // identical to doing nothing
  })
})

const stopHands = (drift = NO): SwarmInput => ({
  present: true,
  pose: 'open',
  dir: NO,
  pinch: 0,
  drift,
  reach: 0.5,
  stop: true,
})

describe('stop gesture (both hands open): brake smoothly to a standstill, then keep floating there', () => {
  const BW = 150000
  const BH = 6000
  const cruising = (secs = 2.5) => {
    const s = new Swarm(BW, BH)
    run(s, 5, hand('open'))
    run(s, secs, point(1, 0))
    return s
  }

  it('a fast swarm comes to a standstill in about half a second, with no sudden jolt', () => {
    const s = cruising()
    const v0 = s.centroid().vx
    expect(v0).toBeGreaterThan(1500)
    let prev = v0
    let sharpest = 0
    for (let i = 0; i < 30; i++) {
      s.step(1 / 60, stopHands())
      const vx = s.centroid().vx
      sharpest = Math.max(sharpest, prev - vx)
      prev = vx
    }
    expect(s.centroid().vx).toBeLessThan(v0 * 0.12) // ≈ 0.5 s later it has all but stopped
    expect(sharpest).toBeLessThan(v0 * 0.2) // eased in, never an instant stop
    run(s, 1.5, stopHands())
    expect(speed(s)).toBeLessThan(20)
  })

  it('afterwards it just keeps floating where it stopped (open palm = gravity off, nothing pulls it back)', () => {
    const s = cruising()
    run(s, 2, stopHands())
    const c = s.centroid()
    run(s, 4, hand('open'))
    const c2 = s.centroid()
    expect(Math.hypot(c2.x - c.x, c2.y - c.y)).toBeLessThan(60)
    expect(speed(s)).toBeLessThan(25)
    expect(s.hovering).toBeGreaterThan(0.95)
  })

  it('stops quickly compared with coasting (that is the point)', () => {
    const coast = cruising()
    const stopped = cruising()
    run(coast, 1, hand('open'))
    run(stopped, 1, stopHands())
    expect(Math.abs(stopped.centroid().vx)).toBeLessThan(Math.abs(coast.centroid().vx) * 0.1)
    expect(stopped.centroid().x).toBeLessThan(coast.centroid().x - 500)
  })

  it('cancels the pointing stream and the hand drift, and releases when the gesture ends', () => {
    const s = cruising()
    run(s, 2, stopHands({ x: 1.2, y: 0 })) // hands waving while both open: no drift
    expect(s.mode).toBe('levitate')
    expect(speed(s)).toBeLessThan(20)
    run(s, 2, wave(1.2, 0)) // one open hand waving again: the drift is back
    expect(s.centroid().vx).toBeGreaterThan(20)
    expect(s.braking).toBeLessThan(0.01)
  })

  it('also calms a circling swarm, and braking eases back out smoothly', () => {
    const s = new Swarm(BW, BH)
    run(s, 5, hand('two'))
    run(s, 1.5, stopHands())
    expect(s.braking).toBeGreaterThan(0.95)
    run(s, 0.3, hand('open'))
    expect(s.braking).toBeGreaterThan(0.01) // still easing out, not switched off in one frame
    run(s, 1, hand('open'))
    expect(s.braking).toBeLessThan(0.01)
  })

  it('a lost hand releases it too', () => {
    const s = cruising()
    run(s, 1, stopHands())
    run(s, 1, none)
    expect(s.braking).toBeLessThan(0.01)
  })
})

describe('speed control: the hand distance sets how fast the pointing moves the swarm', () => {
  const BW = 150000
  const BH = 6000 // wide enough that nothing reaches a wall
  const floating = () => {
    const s = new Swarm(BW, BH)
    run(s, 5, hand('open'))
    return s
  }

  it('a closer hand moves it faster, a farther hand slower, a middle distance as before', () => {
    const speeds: Record<string, number> = {}
    for (const [name, reach] of [
      ['far', 0],
      ['mid', 0.5],
      ['near', 1],
    ] as const) {
      const s = floating()
      run(s, 2, point(1, 0, reach))
      speeds[name] = s.centroid().vx
    }
    expect(speeds.far!).toBeGreaterThan(100) // slow, but it does move
    expect(speeds.mid!).toBeGreaterThan(speeds.far! * 1.8)
    expect(speeds.near!).toBeGreaterThan(speeds.mid! * 1.4)
    // the middle distance is the 1× reference (same as passing no reach at all)
    const ref = floating()
    run(ref, 2, point(1, 0))
    expect(speeds.mid!).toBeCloseTo(ref.centroid().vx, 3)
  })

  it('moving the hand nearer / further changes the speed smoothly, not in a jump', () => {
    const s = floating()
    run(s, 2, point(1, 0, 0.5))
    let prev = s.centroid().vx
    let prevDelta = 0
    let maxJerk = 0 // sudden change of the acceleration = a jump in the push
    const track = () => {
      const vx = s.centroid().vx
      const delta = vx - prev
      maxJerk = Math.max(maxJerk, Math.abs(delta - prevDelta))
      prevDelta = delta
      prev = vx
    }
    track()
    for (let i = 0; i < 120; i++) {
      s.step(1 / 60, point(1, 0, 1)) // the hand comes close
      track()
    }
    expect(s.centroid().vx).toBeGreaterThan(1900) // a higher pace than the middle distance gives
    for (let i = 0; i < 180; i++) {
      s.step(1 / 60, point(1, 0, 0)) // the hand moves away
      track()
    }
    expect(maxJerk).toBeLessThan(40) // eased: a real jump would be hundreds (a wall bounce measured 1600)
  })

  it('the hand distance also sets the top speed: holding the point builds up to it and no further', () => {
    const top: number[] = []
    for (const reach of [0, 0.5, 1]) {
      const s = floating()
      let max = 0
      for (let i = 0; i < 60 * 9; i++) {
        s.step(1 / 60, point(1, 0, reach))
        max = Math.max(max, s.centroid().vx)
      }
      top.push(max)
      // it has levelled off, not still running away
      const before = s.centroid().vx
      run(s, 1, point(1, 0, reach))
      expect(s.centroid().vx, `reach ${reach}`).toBeLessThan(before * 1.2)
    }
    expect(top[0]!).toBeLessThan(2200) // far: slow
    expect(top[1]!).toBeGreaterThan(top[0]! * 1.5)
    expect(top[1]!).toBeLessThan(5200) // middle: brisk
    expect(top[2]!).toBeGreaterThan(top[1]! * 1.15)
    expect(top[2]!).toBeLessThan(8500) // close: fast, but never absurd
  })

  it('the cap does not brake an open palm: once the point stops, the balls just coast', () => {
    const s = floating()
    run(s, 3, point(1, 0, 1))
    const v0 = s.centroid().vx
    run(s, 0.3, hand('open'))
    expect(s.centroid().vx).toBeGreaterThan(v0 * 0.7)
  })

  it('a missing reach falls back to the middle distance', () => {
    const a = floating()
    const b = floating()
    run(a, 2, point(1, 0, 0.5))
    run(b, 2, point(1, 0, Number.NaN))
    expect(b.centroid().vx).toBeCloseTo(a.centroid().vx, 3)
  })
})

describe('move (velocity, not position)', () => {
  it('speed builds up gradually instead of jumping', () => {
    const s = new Swarm(W, H)
    run(s, 3, hand('open'))
    const speeds: number[] = []
    let lastVx = s.centroid().vx
    let maxJump = 0
    for (let i = 0; i < 90; i++) {
      s.step(1 / 60, point(1, 0))
      const vx = s.centroid().vx
      maxJump = Math.max(maxJump, Math.abs(vx - lastVx))
      lastVx = vx
      if (i === 5 || i === 30 || i === 89) speeds.push(vx)
    }
    expect(s.mode).toBe('move')
    expect(speeds[0]!).toBeLessThan(speeds[1]!)
    expect(speeds[1]!).toBeLessThan(speeds[2]! + 1) // keeps accelerating toward the terminal speed
    expect(speeds[0]!).toBeLessThan(120) // 0.1 s in: nowhere near full speed
    expect(maxJump).toBeLessThan(40) // per-frame velocity change stays small
  })

  it('the swarm moves the way the finger points and travels as one', () => {
    const s = new Swarm(W, H)
    run(s, 3, hand('open'))
    const c0 = s.centroid()
    run(s, 1.2, point(1, 0))
    const c1 = s.centroid()
    expect(c1.x).toBeGreaterThan(c0.x + 100)
    expect(Math.abs(c1.y - c0.y)).toBeLessThan(30)
    expect(meanRadius(s)).toBeLessThan(s.cloud * 3.5) // stretched into a comet, but still one swarm
    run(s, 0.7, point(0, -1))
    expect(s.centroid().y).toBeLessThan(c1.y - 80)
  })

  it('direction is normalised: a long vector is not faster', () => {
    const a = new Swarm(W, H)
    const b = new Swarm(W, H)
    run(a, 3, hand('open'))
    run(b, 3, hand('open'))
    run(a, 0.5, point(1, 0))
    run(b, 0.5, point(5, 0))
    expect(a.centroid().x).toBeCloseTo(b.centroid().x, 3)
  })

  it('coasts after the push stops: momentum fades smoothly, no sudden stop', () => {
    const s = new Swarm(W, H)
    run(s, 3, hand('open'))
    run(s, 2, point(1, 0))
    const cruising = s.centroid().vx
    expect(cruising).toBeGreaterThan(200)
    run(s, 0.2, hand('pinch')) // not pointing any more; mode stays 'move'
    expect(s.mode).toBe('move')
    const after = s.centroid().vx
    expect(after).toBeGreaterThan(cruising * 0.4) // still coasting
    run(s, 1.3, hand('pinch'))
    expect(speed(s)).toBeLessThan(cruising) // slowing down by now (it may still have been speeding up when the push stopped)
    run(s, 4, hand('pinch'))
    expect(speed(s)).toBeLessThan(cruising * 0.05)
  })

  it('open palm brakes where the swarm is and holds it there (no snap back)', () => {
    const s = new Swarm(W, H)
    run(s, 3, hand('open'))
    const x0 = s.centroid().x
    run(s, 1.5, point(1, 0))
    run(s, 12, hand('open')) // the light air drag takes a while to stop it
    expect(s.mode).toBe('levitate')
    expect(s.centroid().x).toBeGreaterThan(x0 + 150)
    expect(speed(s)).toBeLessThan(40)
  })

  it('pointing from the floor lifts the swarm and moves it in one go', () => {
    const s = new Swarm(W, H)
    run(s, 2, none)
    run(s, 2, point(1, 0))
    expect(s.hovering).toBeGreaterThan(0.95)
    expect(s.centroid().y).toBeLessThan(s.floorY - 20)
  })

  it('pointing with no usable direction does not push', () => {
    const s = new Swarm(W, H)
    run(s, 3, hand('open'))
    const x0 = s.centroid().x
    run(s, 2, point(0, 0))
    expect(Math.abs(s.centroid().x - x0)).toBeLessThan(40)
  })

  it('walls just bounce the balls; nothing leaves the window or goes non-finite', () => {
    const s = new Swarm(W, H)
    run(s, 10, point(1, 1))
    run(s, 10, point(-1, -1))
    for (const b of s.balls) {
      expect(Number.isFinite(b.x + b.y + b.vx + b.vy)).toBe(true)
      expect(b.x).toBeGreaterThanOrEqual(s.radius - 0.01)
      expect(b.x).toBeLessThanOrEqual(W - s.radius + 0.01)
      expect(b.y).toBeGreaterThanOrEqual(s.radius - 0.01)
      expect(b.y).toBeLessThanOrEqual(s.floorY + 0.01)
    }
  })

  it('a fist keeps the momentum: the balls fall with the speed they had', () => {
    const s = new Swarm(W, H)
    run(s, 3, hand('open'))
    run(s, 2, point(1, 0))
    const vx = s.centroid().vx
    run(s, 0.1, hand('fist'))
    expect(s.centroid().vx).toBeGreaterThan(vx * 0.5)
    expect(s.hovering).toBeLessThan(1)
  })
})

describe('pointing = a stream of force that spreads from the line', () => {
  /** distance of a ball from the line through the swarm's average point along `dir` */
  const offLine = (s: Swarm, dir: { x: number; y: number }) => {
    const c = s.centroid()
    return s.balls.map((b) => ({ b, off: Math.abs((b.x - c.x) * dir.y - (b.y - c.y) * dir.x) }))
  }

  it('does not push everything at once: balls nearest the line start first, the rest follow', () => {
    const s = new Swarm(W, H)
    run(s, 4, hand('open'))
    const ranked = offLine(s, { x: 1, y: 0 }).sort((a, b) => a.off - b.off)
    const third = Math.floor(ranked.length / 3)
    const near = ranked.slice(0, third).map((r) => r.b)
    const far = ranked.slice(-third).map((r) => r.b)
    const avgE = (bs: typeof near) => bs.reduce((a, b) => a + b.e, 0) / bs.length
    run(s, 0.3, point(1, 0))
    expect(avgE(near)).toBeGreaterThan(avgE(far) + 0.15) // the stream has caught the near balls, not yet the far ones
    expect(avgE(far)).toBeLessThan(0.5)
    run(s, 0.3, point(1, 0))
    expect(avgE(far)).toBeLessThan(avgE(near)) // still spreading outward
    run(s, 0.8, point(1, 0))
    expect(avgE(far)).toBeGreaterThan(0.9) // …and then everyone is in it (takes about a second)
  })

  it('catches balls ahead of the swarm before balls behind it', () => {
    const s = new Swarm(W, H)
    run(s, 4, hand('open'))
    const c = s.centroid()
    const ahead = s.balls.filter((b) => b.x - c.x > 40 && Math.abs(b.y - c.y) < 40)
    const behind = s.balls.filter((b) => c.x - b.x > 40 && Math.abs(b.y - c.y) < 40)
    expect(ahead.length).toBeGreaterThan(0)
    expect(behind.length).toBeGreaterThan(0)
    run(s, 0.4, point(1, 0))
    const avgE = (bs: typeof ahead) => bs.reduce((a, b) => a + b.e, 0) / bs.length
    expect(avgE(ahead)).toBeGreaterThan(avgE(behind))
  })

  it('velocities turn toward the line and the swarm is pulled onto it', () => {
    const s = new Swarm(W, H)
    run(s, 4, hand('open'))
    const dir = { x: 0.6, y: -0.8 }
    const spreadBefore = Math.sqrt(
      offLine(s, dir).reduce((a, r) => a + r.off * r.off, 0) / s.balls.length,
    )
    run(s, 1.5, point(dir.x, dir.y))
    const c = s.centroid()
    const angle = Math.acos((c.vx * dir.x + c.vy * dir.y) / Math.hypot(c.vx, c.vy))
    expect(angle).toBeLessThan(0.25) // the swarm's velocity now follows the line (±14°)
    const spreadAfter = Math.sqrt(
      offLine(s, dir).reduce((a, r) => a + r.off * r.off, 0) / s.balls.length,
    )
    expect(spreadAfter).toBeLessThan(spreadBefore * 0.8) // squeezed into a stream along it
  })

  it('turning the finger sweeps the stream round gradually', () => {
    const s = new Swarm(W, H)
    run(s, 4, hand('open'))
    run(s, 1.5, point(1, 0))
    expect(s.centroid().vx).toBeGreaterThan(150)
    run(s, 0.1, point(0, -1))
    expect(s.centroid().vy).toBeGreaterThan(-450) // a 90° turn is not instant
    expect(s.centroid().vx).toBeGreaterThan(300)
    run(s, 3, point(0, -1))
    const c = s.centroid()
    expect(c.vy).toBeLessThan(-150)
    expect(Math.abs(c.vx)).toBeLessThan(80)
  })

  it('when pointing stops the push fades out instead of cutting off', () => {
    const s = new Swarm(W, H)
    run(s, 4, hand('open'))
    run(s, 1.5, point(1, 0))
    const e0 = s.balls.reduce((a, b) => a + b.e, 0) / s.balls.length
    run(s, 0.1, hand('pinch'))
    const e1 = s.balls.reduce((a, b) => a + b.e, 0) / s.balls.length
    expect(e1).toBeLessThan(e0)
    expect(e1).toBeGreaterThan(e0 * 0.6)
    run(s, 4, hand('pinch'))
    expect(s.balls.reduce((a, b) => a + b.e, 0) / s.balls.length).toBeLessThan(0.02)
  })
})

describe('moving as a comet: teardrop → long streak, faster and faster', () => {
  const BW = 12000
  const BH = 6000 // big enough that nothing touches a wall during these runs
  const stats = (s: Swarm) => {
    const c = s.centroid()
    const rows = s.balls.map((b) => ({ a: b.x - c.x, p: b.y - c.y, vx: b.vx }))
    const sd = (v: number[]) => Math.sqrt(v.reduce((a, x) => a + x * x, 0) / v.length)
    const sorted = [...rows].sort((a, b) => b.a - a.a)
    const head = sorted.slice(0, 20)
    const tail = sorted.slice(-20)
    const avg = (v: number[]) => v.reduce((a, x) => a + x, 0) / v.length
    return {
      length: sd(rows.map((r) => r.a)),
      width: sd(rows.map((r) => r.p)),
      headWidth: sd(head.map((r) => r.p)),
      tailWidth: sd(tail.map((r) => r.p)),
      headV: avg(head.map((r) => r.vx)),
      tailV: avg(tail.map((r) => r.vx)),
      speed: c.vx,
    }
  }
  const launch = () => {
    const s = new Swarm(BW, BH)
    run(s, 2, hand('open'))
    run(s, 3, hand('pinch', 1)) // gather into a round clump…
    run(s, 3, hand('open')) // …and let it float loose
    return s
  }

  it('starts round, becomes a teardrop with a narrow head, then a long thin streak', () => {
    const s = launch()
    const round = stats(s)
    expect(round.length / round.width).toBeLessThan(1.4)
    run(s, 1.2, point(1, 0))
    const drop = stats(s)
    expect(drop.headWidth).toBeLessThan(drop.tailWidth * 0.7) // narrow tip, looser tail
    expect(drop.length / drop.width).toBeGreaterThan(3) // already clearly elongated
    expect(drop.width).toBeLessThan(round.width * 1.1) // squeezed onto the line, not fatter
    run(s, 1.3, point(1, 0))
    const streak = stats(s)
    expect(streak.length / streak.width).toBeGreaterThan(8) // long and thin
    expect(streak.width).toBeLessThan(round.width * 0.9)
    expect(streak.length).toBeLessThan(s.cloud * 6) // …but it is allowed to stretch only so far
  })

  it('the head leads: its balls move faster than the tail while the swarm stretches', () => {
    const s = launch()
    run(s, 1.4, point(1, 0))
    const m = stats(s)
    expect(m.headV).toBeGreaterThan(m.tailV + 300)
    expect(m.headV).toBeGreaterThan(m.speed)
    expect(m.tailV).toBeLessThan(m.speed)
  })

  it('speed climbs faster and faster while you keep pointing', () => {
    const s = launch()
    const v: number[] = []
    for (const dur of [0.8, 0.8, 0.8]) {
      run(s, dur, point(1, 0))
      v.push(stats(s).speed)
    }
    expect(v[0]!).toBeGreaterThan(150)
    expect(v[1]! - v[0]!).toBeGreaterThan(v[0]!) // the second step gains more than the first…
    expect(v[2]! - v[1]!).toBeGreaterThan(v[1]! - v[0]!) // …and the third more than the second
    expect(v[2]!).toBeGreaterThan(1300)
  })

  it('a second point soon after starts from a partly built-up push, not from zero', () => {
    const s = launch()
    run(s, 2.5, point(1, 0))
    run(s, 0.5, hand('pinch')) // released briefly
    const a = new Swarm(BW, BH)
    run(a, 8, hand('open'))
    run(s, 0.8, point(1, 0))
    run(a, 0.8, point(1, 0))
    expect(stats(s).headV).toBeGreaterThan(stats(a).headV)
  })
})

describe('starting to point: the stream catches balls one by one, nothing clumps first', () => {
  /** a loose, spread-out swarm: circle for a while, then let it drift */
  const looseSwarm = () => {
    const s = new Swarm(12000, 6000)
    run(s, 2, hand('open'))
    run(s, 3, hand('two'))
    run(s, 2, hand('open'))
    return s
  }

  it('the swarm does not contract before it moves off', () => {
    const s = looseSwarm()
    const r0 = meanRadius(s)
    expect(r0).toBeGreaterThan(150) // really loose to begin with
    for (let i = 0; i < 36; i++) {
      s.step(1 / 60, point(1, 0))
      expect(meanRadius(s)).toBeGreaterThan(r0 * 0.97) // never pulled together
    }
  })

  it('the head balls start moving at once; balls the stream has not reached yet are left completely alone', () => {
    const s = looseSwarm()
    const sorted = [...s.balls].sort((a, b) => b.x - a.x)
    const head = sorted.slice(0, 10)
    const tail = sorted.slice(-10)
    const avgVx = (bs: typeof head) => bs.reduce((a, b) => a + b.vx, 0) / bs.length
    const h0 = avgVx(head)
    const t0 = avgVx(tail)
    run(s, 0.3, point(1, 0))
    expect(avgVx(head) - h0).toBeGreaterThan(60) // already underway…
    // …while the tail hasn't felt anything: it only slows by the air drag (0.6/s) like any free ball
    expect(Math.abs(avgVx(tail) - t0 * Math.exp(-0.6 * 0.3))).toBeLessThan(8)
    expect(tail.every((b) => b.e < 0.01)).toBe(true)
    run(s, 0.3, point(1, 0))
    expect(avgVx(tail) - t0).toBeLessThan(avgVx(head) - h0) // the tail joins later, one after another
    run(s, 1.2, point(1, 0))
    expect(avgVx(tail) - t0).toBeGreaterThan(200) // and does join in
  })

  it('every ball keeps its own velocity (drag only) until the stream reaches it', () => {
    const s = new Swarm(W, H)
    run(s, 4, hand('open'))
    // give the tail a velocity of its own, then start pointing: the unreached tail must simply carry on
    const sorted = [...s.balls].sort((a, b) => b.x - a.x)
    const tail = sorted.slice(-8)
    for (const b of tail) b.vy = -120
    run(s, 0.25, point(1, 0))
    for (const b of tail) expect(b.vy).toBeLessThan(-120 * Math.exp(-1.2 * 0.25) * 0.85)
    for (const b of tail) expect(b.vy).toBeGreaterThan(-125)
  })
})

describe('hand-over between behaviours is gradual', () => {
  const cruise = () => {
    const s = new Swarm(W, H)
    run(s, 4, hand('open'))
    run(s, 1.3, point(1, 0)) // fast, but still clear of the right wall
    return s
  }

  it('move → pinch / circle: the centre is the FRONT ball, not the middle', () => {
    for (const pose of ['pinch', 'two'] as const) {
      const s = cruise()
      const c = s.centroid()
      const head = headBall(s, { x: 1, y: 0 })
      const headX = head.x
      expect(headX - c.x).toBeGreaterThan(150) // the comet has a real head ahead of its middle
      run(s, 0.1, pose === 'pinch' ? hand('pinch', 1) : hand('two'))
      expect(s.anchor, pose).not.toBeNull()
      expect(s.anchor!.x, pose).toBeGreaterThan(c.x + (headX - c.x) * 0.8) // at the head, not at the middle
      expect(s.anchor!.vx, pose).toBeGreaterThan(400) // and it keeps coasting with the head's own speed
      run(s, 4, pose === 'pinch' ? hand('pinch', 1) : hand('two'))
      // the swarm ends up gathered around where the head was heading — beyond where the head was, far from the old middle
      expect(s.centroid().x, pose).toBeGreaterThan(headX)
      expect(meanRadius(s), pose).toBeLessThan(s.cloud * 1.2)
    }
  })

  it('the centre keeps moving a while, then stops with the air drag (no sudden stop)', () => {
    const s = cruise()
    run(s, 0.1, hand('pinch', 1))
    const a0 = s.anchor!.x
    let prev = s.anchor!.vx
    let sharpestDrop = 0
    for (let i = 0; i < 900; i++) {
      s.step(1 / 60, hand('pinch', 1))
      sharpestDrop = Math.max(sharpestDrop, prev - s.anchor!.vx)
      prev = s.anchor!.vx
    }
    expect(s.anchor!.x).toBeGreaterThan(a0 + 300)
    expect(s.anchor!.vx).toBeLessThan(10)
    expect(sharpestDrop).toBeLessThan(25)
  })

  it('when the swarm is (nearly) still, pinch / circle gather around its middle', () => {
    for (const pose of ['pinch', 'two'] as const) {
      const s = new Swarm(W, H)
      run(s, 4, hand('open'))
      const c = s.centroid()
      run(s, 0.1, pose === 'pinch' ? hand('pinch', 1) : hand('two'))
      expect(Math.hypot(s.anchor!.x - c.x, s.anchor!.y - c.y), pose).toBeLessThan(40)
    }
  })

  it('the centre goes away when neither pinch nor circle is happening', () => {
    const s = new Swarm(W, H)
    run(s, 4, hand('open'))
    run(s, 1, hand('pinch', 1))
    expect(s.anchor).not.toBeNull()
    run(s, 1, hand('open'))
    expect(s.anchor).toBeNull()
  })

  it('move → open palm: also brakes gradually', () => {
    const s = cruise()
    const v0 = s.centroid().vx
    run(s, 0.2, hand('open'))
    expect(s.centroid().vx).toBeGreaterThan(v0 * 0.5)
    run(s, 12, hand('open'))
    expect(speed(s)).toBeLessThan(40)
  })

  it('circle → move: the orbit fades out while the stream builds up (no instant switch)', () => {
    const s = new Swarm(W, H)
    run(s, 6, hand('two'))
    const omega0 = Math.abs(meanOmega(s))
    expect(omega0).toBeGreaterThan(0.8)
    run(s, 0.15, point(1, 0))
    expect(Math.abs(meanOmega(s))).toBeGreaterThan(omega0 * 0.3) // still swirling a moment later
    expect(s.centroid().vx).toBeLessThan(320) // and not yet shot off
    run(s, 2.5, point(1, 0))
    expect(s.centroid().vx).toBeGreaterThan(150)
    expect(Math.abs(s.centroid().vy)).toBeLessThan(s.centroid().vx * 0.3) // heading the way the finger points
  })
})

describe('circle', () => {
  it('two fingers make the swarm orbit its own average point', () => {
    const s = new Swarm(W, H)
    run(s, 3.5, hand('open'))
    expect(Math.abs(meanOmega(s))).toBeLessThan(0.3)
    run(s, 5, hand('two'))
    expect(s.mode).toBe('circle')
    expect(Math.abs(meanOmega(s))).toBeGreaterThan(0.8)
    expect(meanRadius(s)).toBeLessThan(s.cloud * 1.5) // orbiting, not flying apart
    expect(speed(s)).toBeLessThan(60) // the whole swarm stays in place
  })

  it('spin builds up gradually', () => {
    const s = new Swarm(W, H)
    run(s, 3.5, hand('open'))
    run(s, 0.15, hand('two'))
    const early = Math.abs(meanOmega(s))
    run(s, 4, hand('two'))
    expect(early).toBeLessThan(Math.abs(meanOmega(s)) * 0.6)
  })

  it('from the floor: lifts and circles in one go', () => {
    const s = new Swarm(W, H)
    run(s, 2, none)
    run(s, 6, hand('two'))
    expect(s.hovering).toBeGreaterThan(0.95)
    expect(Math.abs(meanOmega(s))).toBeGreaterThan(0.8)
  })

  it('open palm calms the orbit; fist drops from circling', () => {
    const s = new Swarm(W, H)
    run(s, 5, hand('two'))
    run(s, 5, hand('open'))
    expect(s.mode).toBe('levitate')
    expect(Math.abs(meanOmega(s))).toBeLessThan(0.3)
    expect(s.hovering).toBeGreaterThan(0.95)
    run(s, 3, hand('two'))
    run(s, 3, hand('fist'))
    expect(s.hovering).toBe(0)
  })

  it('a pinch tightens the orbit', () => {
    const s = new Swarm(W, H)
    run(s, 6, hand('two'))
    const loose = meanRadius(s)
    run(s, 3, hand('pinch', 1))
    expect(s.mode).toBe('circle')
    expect(meanRadius(s)).toBeLessThan(loose * 0.95)
  })
})

describe('robustness', () => {
  it('other poses (pinch / none) do not change the mode', () => {
    const s = new Swarm(W, H)
    run(s, 1, hand('open'))
    for (const pose of ['pinch', 'none'] as const) {
      run(s, 0.5, hand(pose))
      expect(s.mode).toBe('levitate')
    }
  })

  it('stays finite and inside the window with a huge dt or a wild pinch value', () => {
    const s = new Swarm(W, H)
    s.step(5, hand('two', 99))
    run(s, 3, hand('two', -7))
    for (const b of s.balls) {
      expect(Number.isFinite(b.x + b.y)).toBe(true)
      expect(b.x).toBeGreaterThanOrEqual(s.radius - 0.01)
      expect(b.x).toBeLessThanOrEqual(W - s.radius + 0.01)
      expect(b.y).toBeLessThanOrEqual(s.floorY + 0.01)
    }
  })

  it('resize keeps balls inside the new bounds', () => {
    const s = new Swarm(W, H)
    s.resize(400, 300)
    for (const b of s.balls) {
      expect(b.x).toBeLessThanOrEqual(400)
      expect(b.y).toBeLessThanOrEqual(s.floorY)
    }
  })
})
