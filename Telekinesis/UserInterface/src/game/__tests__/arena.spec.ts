import * as pl from 'planck'
import { describe, expect, it } from 'vitest'
import { Swarm, type SwarmInput } from '../swarm'
import { ARENA, Arena } from '../arena'
import { PHYS, type Prop } from '../physics'
import { STAGES } from '../stages'

const W = 6875
const H = 4375
const FLOOR = H - 110
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

const make = (stage = 0) => ({ sw: new Swarm(W, H), arena: new Arena(W, H, FLOOR, stage) })
function frame(sw: Swarm, arena: Arena, inp: SwarmInput, dt = 1 / 60) {
  sw.step(dt, inp)
  arena.update(dt, sw)
}
const run = (sw: Swarm, arena: Arena, seconds: number, inp: SwarmInput = input('fist')) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) frame(sw, arena, inp)
}
const of = (arena: Arena, kind: Prop['kind']) => arena.phys.props.filter((p) => p.kind === kind)
/** park every ball far away so only the one we place matters */
const parkBalls = (sw: Swarm) =>
  sw.balls.forEach((b) => ((b.x = 60), (b.y = FLOOR - 20), (b.vx = 0), (b.vy = 0)))
/** fire one ball at a point from the left at speed `v` (units/s) */
function fire(sw: Swarm, at: { x: number; y: number }, v: number, from = 250) {
  parkBalls(sw)
  Object.assign(sw.balls[0]!, { x: at.x - from, y: at.y, vx: v, vy: 0, lev: 1 })
}

describe('stages', () => {
  it('there are five, with distinct ids and names', () => {
    expect(STAGES).toHaveLength(5)
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(5)
    expect(new Set(STAGES.map((s) => s.name)).size).toBe(5)
    STAGES.forEach((s) => expect(s.hint.length).toBeGreaterThan(10))
  })

  for (let i = 0; i < 5; i++) {
    describe(`stage ${i + 1}: ${STAGES[i]!.name}`, () => {
      it('builds inside the world, with a goal that can be met, and leaves the start heap free', () => {
        const { arena } = make(i)
        expect(arena.goal.need).toBeGreaterThanOrEqual(1)
        expect(arena.goal.have).toBe(0)
        expect(arena.cleared).toBe(false)
        for (const p of arena.phys.props) {
          const c = arena.phys.pos(p)
          expect(c.x, `${p.kind} x`).toBeGreaterThan(0)
          expect(c.x, `${p.kind} x`).toBeLessThan(W)
          expect(c.y, `${p.kind} y`).toBeLessThan(FLOOR + 1)
          expect(c.y, `${p.kind} y`).toBeGreaterThan(-100)
        }
        // the heap rests at the centre ± ~210 and floats up to ~300: nothing solid there
        const solid = arena.phys.props.filter((p) => p.kind !== 'balloon' && p.kind !== 'anchor')
        for (const p of solid) {
          const c = arena.phys.pos(p)
          expect(
            Math.abs(c.x - W / 2) > 400 || c.y < FLOOR - 700,
            `${p.kind} at ${c.x},${c.y}`,
          ).toBe(true)
        }
      })

      it('is perfectly calm at the start: nothing moves, nothing scores, nothing makes a sound', () => {
        const { sw, arena } = make(i)
        const home = arena.phys.props.map((p) => ({ ...arena.phys.pos(p) }))
        run(sw, arena, 2.5)
        arena.phys.props
          .filter((p) => p.body.isDynamic())
          .forEach((p) => expect(arena.phys.speed(p) * PHYS.scale, `${p.kind}`).toBeLessThan(0.15))
        arena.phys.props.forEach((p, k) => {
          const c = arena.phys.pos(p)
          expect(Math.hypot(c.x - home[k]!.x, c.y - home[k]!.y), `${p.kind} drifted`).toBeLessThan(
            25,
          )
        })
        expect(arena.score).toBe(0)
        expect(arena.combo).toBe(0)
        expect(arena.drainEvents()).toEqual([])
        expect(arena.goal.have).toBe(0)
      })

      it('has no two objects overlapping when it is built (nothing gets shoved at the start)', () => {
        const { arena } = make(i)
        const ps = arena.phys.props.filter((p) => p.kind !== 'anchor')
        const pos = (p: Prop) => arena.phys.pos(p)
        const eps = 0.5
        const overlap = (a: Prop, b: Prop): boolean => {
          const pa = pos(a)
          const pb = pos(b)
          if (a.shape.type === 'box' && b.shape.type === 'box')
            return (
              Math.abs(pa.x - pb.x) < a.shape.hw + b.shape.hw - eps &&
              Math.abs(pa.y - pb.y) < a.shape.hh + b.shape.hh - eps
            )
          if (a.shape.type === 'circle' && b.shape.type === 'circle')
            return Math.hypot(pa.x - pb.x, pa.y - pb.y) < a.shape.r + b.shape.r - eps
          const [c, bx] = a.shape.type === 'circle' ? [a, b] : [b, a]
          if (c.shape.type !== 'circle' || bx.shape.type !== 'box') return false
          const pc = pos(c)
          const pbx = pos(bx)
          const nx = Math.max(pbx.x - bx.shape.hw, Math.min(pc.x, pbx.x + bx.shape.hw))
          const ny = Math.max(pbx.y - bx.shape.hh, Math.min(pc.y, pbx.y + bx.shape.hh))
          return Math.hypot(pc.x - nx, pc.y - ny) < c.shape.r - eps
        }
        const clashes: string[] = []
        for (let a = 0; a < ps.length; a++)
          for (let b = a + 1; b < ps.length; b++) {
            const [pa, pb] = [ps[a]!, ps[b]!]
            if (!pa.body.isDynamic() && !pb.body.isDynamic()) continue // posts, gongs, the platform: built to touch
            if (overlap(pa, pb)) clashes.push(`${pa.kind}#${pa.id} × ${pb.kind}#${pb.id}`)
          }
        expect(clashes).toEqual([])
      })

      it('is deterministic', () => {
        const go = () => {
          const { sw, arena } = make(i)
          run(sw, arena, 2)
          return arena.phys.props.map((p) => arena.phys.pos(p))
        }
        expect(go()).toEqual(go())
      })
    })
  }
})

describe('balloons', () => {
  it('a fast hit pops one: it disappears with its rope, the goal moves on, you score', () => {
    const { sw, arena } = make(0)
    run(sw, arena, 1)
    const balloon = of(arena, 'balloon')[0]!
    const joints = arena.phys.world.getJointCount()
    fire(sw, arena.phys.pos(balloon), 3000)
    run(sw, arena, 0.5, input('open'))
    expect(balloon.popped).toBe(true)
    expect(balloon.alive).toBe(false)
    expect(of(arena, 'balloon')).toHaveLength(7)
    expect(arena.phys.world.getJointCount()).toBe(joints - 1)
    expect(arena.goal.have).toBe(1)
    expect(arena.score).toBe(ARENA.points.pop)
    const kinds = arena.drainEvents().map((e) => e.type)
    expect(kinds).toContain('pop')
    expect(kinds).toContain('score')
  })

  it('a gentle brush does not pop it (but does push it)', () => {
    const { sw, arena } = make(0)
    run(sw, arena, 1)
    const balloon = of(arena, 'balloon')[0]!
    fire(sw, arena.phys.pos(balloon), 250) // 2.5 m/s: a drifting ball
    run(sw, arena, 1, input('open'))
    expect(balloon.alive).toBe(true)
    expect(arena.goal.have).toBe(0)
    expect(arena.score).toBe(0)
  })

  it('a crate dropped onto a balloon pops it too', () => {
    const { sw, arena } = make(0)
    run(sw, arena, 2)
    const balloon = of(arena, 'balloon')[0]!
    const c = arena.phys.pos(balloon)
    arena.phys.addBox('crate', c.x, c.y - 900, 60, 60, { density: 1.4 })
    run(sw, arena, 1.5)
    expect(balloon.popped).toBe(true)
    expect(arena.goal.have).toBeGreaterThanOrEqual(1)
  })

  it('one vertical comet through the cluster above the heap pops several at once and builds a combo', () => {
    const { sw, arena } = make(0)
    run(sw, arena, 1, input('open'))
    run(sw, arena, 5, input('point', { x: 0, y: -1 }))
    expect(arena.goal.have).toBeGreaterThanOrEqual(2)
    expect(arena.score).toBeGreaterThan(ARENA.points.pop * 2) // the combo multiplied the second pop
  })
})

describe('gongs', () => {
  const gongs = (a: Arena) => of(a, 'gong')

  it('ring only when hit hard enough; the first ring counts for the goal', () => {
    const { sw, arena } = make(1)
    run(sw, arena, 1)
    const g = gongs(arena)[0]!
    fire(sw, arena.phys.pos(g), 100) // 1 m/s: a touch
    run(sw, arena, 0.6, input('open'))
    expect(g.rungCount).toBe(0)
    fire(sw, arena.phys.pos(g), 2500)
    run(sw, arena, 0.6, input('open'))
    expect(g.rungCount).toBe(1)
    expect(arena.goal.have).toBe(1)
    expect(arena.score).toBe(ARENA.points.gong)
    expect(arena.drainEvents().map((e) => e.type)).toContain('ring')
  })

  it('rings once per hit (not once per ball), and re-arms: later rings are worth less and do not count again', () => {
    const { sw, arena } = make(1)
    run(sw, arena, 1)
    const g = gongs(arena)[0]!
    fire(sw, arena.phys.pos(g), 2500)
    run(sw, arena, 0.3, input('open'))
    expect(g.rungCount).toBe(1) // a burst of balls would otherwise ring it a dozen times
    run(sw, arena, ARENA.comboWindow + 0.5) // let the combo run out
    const before = arena.score
    fire(sw, arena.phys.pos(g), 2500)
    run(sw, arena, 0.5, input('open'))
    expect(g.rungCount).toBe(2)
    expect(arena.score - before).toBe(ARENA.points.gongAgain)
    expect(arena.goal.have).toBe(1) // still just the one gong
  })

  it('ringing all three clears the stage once, with the +1000 bonus', () => {
    const { sw, arena } = make(1)
    run(sw, arena, 1)
    for (const g of gongs(arena)) {
      fire(sw, arena.phys.pos(g), 2500)
      run(sw, arena, ARENA.comboWindow + 0.3, input('open')) // keep the combo out of the sum
    }
    expect(arena.goal.have).toBe(3)
    expect(arena.cleared).toBe(true)
    expect(arena.score).toBe(3 * ARENA.points.gong + ARENA.points.clear)
    const events = arena.drainEvents()
    expect(events.filter((e) => e.type === 'clear')).toHaveLength(1)
    run(sw, arena, 2, input('open'))
    expect(arena.score).toBe(3 * ARENA.points.gong + ARENA.points.clear) // the bonus is paid once
  })
})

describe('domino rally', () => {
  it('tipping the first domino starts a chain that topples the line, scores a growing combo and clears the stage', () => {
    const { sw, arena } = make(2)
    run(sw, arena, 2)
    const dominoes = of(arena, 'domino').sort((a, b) => arena.phys.pos(a).x - arena.phys.pos(b).x)
    expect(dominoes).toHaveLength(30)
    // a real tap near the top, like a ball would give (a bare spin just rocks it back: it has to rise to tip over its edge)
    const first = dominoes[0]!.body
    first.applyLinearImpulse(pl.Vec2(0.5, 0), first.getWorldPoint(pl.Vec2(0, -0.5)), true)
    let maxCombo = 0
    for (let t = 0; t < 12; t += 1 / 60) {
      frame(sw, arena, input('fist'))
      maxCombo = Math.max(maxCombo, arena.combo)
    }
    expect(arena.goal.have).toBe(24)
    expect(arena.cleared).toBe(true)
    expect(maxCombo).toBeGreaterThanOrEqual(ARENA.maxMultiplier) // a rally IS a combo
    expect(arena.score).toBeGreaterThan(ARENA.points.clear + 24 * ARENA.points.domino)
  })

  it('a domino only counts once it is tilted past 60°, and only once', () => {
    const { sw, arena } = make(2)
    run(sw, arena, 2)
    const d = of(arena, 'domino')[5]!
    d.body.setAngle(0.8) // ≈ 46°: not yet
    run(sw, arena, 0.05)
    expect(d.counted).toBe(false)
    d.body.setAngle(1.3) // ≈ 74°
    d.body.setAwake(true)
    const before = arena.score
    run(sw, arena, 0.05)
    expect(d.counted).toBe(true)
    run(sw, arena, 0.5)
    expect(arena.score - before).toBeLessThan(ARENA.points.domino * ARENA.maxMultiplier + 1) // not paid repeatedly
  })

  it('nothing happens in the rally until something touches it', () => {
    const { sw, arena } = make(2)
    run(sw, arena, 6)
    expect(arena.goal.have).toBe(0)
  })
})

describe('wrecking ball', () => {
  it('a comet aimed high on the tower brings enough of it down to clear the stage', () => {
    const { sw, arena } = make(3)
    run(sw, arena, 1, input('open'))
    sw.balls.forEach((b, i) => ((b.y = FLOOR - 750 + ((i % 6) - 2.5) * 22), (b.vx = 0), (b.vy = 0)))
    run(sw, arena, 5, input('point', { x: 1, y: 0 }))
    run(sw, arena, 4, input('open'))
    expect(arena.goal.have).toBeGreaterThanOrEqual(12)
    expect(arena.cleared).toBe(true)
  })

  it('a low comet hits the wrecking ball and sets it swinging', () => {
    const { sw, arena } = make(3)
    run(sw, arena, 1, input('open'))
    const ball = of(arena, 'wreck')[0]!
    const home = arena.phys.pos(ball)
    sw.balls.forEach((b, i) => ((b.y = home.y + ((i % 6) - 2.5) * 22), (b.vx = 0), (b.vy = 0)))
    run(sw, arena, 4, input('point', { x: 1, y: 0 }))
    const now = arena.phys.pos(ball)
    expect(Math.hypot(now.x - home.x, now.y - home.y)).toBeGreaterThan(150)
    // it is on a rod: the length never changes
    const anchor = of(arena, 'anchor')[0]!
    const a = arena.phys.pos(anchor)
    expect(Math.hypot(now.x - a.x, now.y - a.y)).toBeGreaterThan(1590)
    expect(Math.hypot(now.x - a.x, now.y - a.y)).toBeLessThan(1610)
  })
})

describe('score and combo', () => {
  it('the first event scores its points; each one inside the window raises the multiplier', () => {
    const { arena } = make(0)
    expect(arena.award(100, 0, 0)).toBe(100)
    expect(arena.combo).toBe(1)
    expect(arena.award(100, 0, 0)).toBe(200)
    expect(arena.award(100, 0, 0)).toBe(300)
    expect(arena.combo).toBe(3)
    expect(arena.score).toBe(600)
  })

  it('the multiplier stops at ×8', () => {
    const { arena } = make(0)
    const gains = Array.from({ length: 12 }, () => arena.award(100, 0, 0))
    expect(gains.slice(0, 8)).toEqual([100, 200, 300, 400, 500, 600, 700, 800])
    expect(gains.slice(8)).toEqual([800, 800, 800, 800])
    expect(arena.multiplier).toBe(8)
  })

  it('each event restarts the window, and a pause longer than it ends the combo', () => {
    const { sw, arena } = make(0)
    arena.award(100, 0, 0)
    run(sw, arena, ARENA.comboWindow - 0.4)
    expect(arena.combo).toBe(1)
    arena.award(100, 0, 0) // inside the window: combo 2, and the window starts again
    run(sw, arena, ARENA.comboWindow - 0.4)
    expect(arena.combo).toBe(2)
    expect(arena.multiplier).toBe(2)
    run(sw, arena, 0.6)
    expect(arena.combo).toBe(0)
    expect(arena.multiplier).toBe(1)
    expect(arena.award(100, 0, 0)).toBe(100) // starts over
  })

  it('every scoring event says which step of the ladder to play, and shows its points as outlined text', () => {
    const { arena } = make(0)
    arena.award(100, 10, 20)
    arena.award(100, 10, 20)
    arena.award(100, 10, 20)
    const notes = arena
      .drainEvents()
      .filter((e) => e.type === 'score')
      .map((e) => e.note)
    expect(notes).toEqual([0, 1, 2])
    const texts = arena.effects.filter((e) => e.kind === 'text').map((e) => e.text)
    expect(texts).toEqual(['+100', '+200 ×2', '+300 ×3'])
    expect(arena.drainEvents()).toEqual([]) // drained
  })

  it('effects fade away on their own', () => {
    const { sw, arena } = make(0)
    arena.award(100, 0, 0)
    expect(arena.effects.length).toBeGreaterThan(0)
    run(sw, arena, 2)
    expect(arena.effects).toHaveLength(0)
  })

  it('a heavy crash scores (once per landing), a settling stage does not', () => {
    const { sw, arena } = make(0)
    // dropped at t = 0.2 s from 15 m: it lands at ~1.2 s, inside the settle time: not play
    run(sw, arena, 0.2)
    arena.phys.addBox('crate', W / 2 + 900, FLOOR - 1500, 60, 60, { density: 1.4 })
    run(sw, arena, 2)
    expect(arena.score).toBe(0)
    // the same drop after the settle time scores a crash, with a thud
    run(sw, arena, 1)
    arena.drainEvents()
    arena.phys.addBox('crate', W / 2 + 1200, FLOOR - 1500, 60, 60, {
      density: 1.4,
      restitution: 0.5,
    })
    let thuds = 0
    for (let t = 0; t < 3; t += 1 / 60) {
      frame(sw, arena, input('fist'))
      thuds += arena.drainEvents().filter((e) => e.type === 'thud').length
    }
    expect(thuds).toBeGreaterThanOrEqual(1)
    expect(thuds).toBeLessThanOrEqual(5) // the cooldown: a bouncing crate is not a machine gun (3 s / 0.6 s)
    // every hard landing is worth `crash` points × the growing combo (the bounces are all inside the window)
    expect(arena.score).toBe((ARENA.points.crash * (thuds * (thuds + 1))) / 2)
  })
})

describe('clear, next, restart', () => {
  const clearStageOne = (sw: Swarm, arena: Arena) => {
    run(sw, arena, 1)
    for (const g of of(arena, 'gong')) {
      fire(sw, arena.phys.pos(g), 2500)
      run(sw, arena, ARENA.comboWindow + 0.3, input('open'))
    }
  }

  it('next() does nothing until the stage is cleared', () => {
    const { arena } = make(0)
    expect(arena.next()).toBe(false)
    expect(arena.stageIndex).toBe(0)
  })

  it('after a clear, next() builds the next stage: new goal, score kept, combo and effects reset', () => {
    const { sw, arena } = make(1)
    clearStageOne(sw, arena)
    expect(arena.cleared).toBe(true)
    const score = arena.score
    const oldWorld = arena.phys
    expect(arena.next()).toBe(true)
    expect(arena.stageIndex).toBe(2)
    expect(arena.stage.id).toBe('domino-rally')
    expect(arena.cleared).toBe(false)
    expect(arena.score).toBe(score)
    expect(arena.combo).toBe(0)
    expect(arena.effects).toHaveLength(0)
    expect(arena.goal.have).toBe(0)
    expect(arena.phys).not.toBe(oldWorld)
    expect(oldWorld.props).toHaveLength(0) // the old stage's bodies are gone
  })

  it('there is nothing after the last stage', () => {
    const { arena } = make(4)
    expect(arena.hasNext).toBe(false)
    arena.cleared = true
    expect(arena.next()).toBe(false)
    expect(arena.stageIndex).toBe(4)
  })

  it('restart() puts everything back: balloons, goal, combo — and the score returns to what it was when the stage began', () => {
    const { sw, arena } = make(0)
    run(sw, arena, 1)
    fire(sw, arena.phys.pos(of(arena, 'balloon')[0]!), 3000)
    run(sw, arena, 0.6, input('open'))
    expect(arena.score).toBeGreaterThan(0)
    expect(of(arena, 'balloon')).toHaveLength(7)
    arena.restart()
    expect(of(arena, 'balloon')).toHaveLength(8)
    expect(arena.score).toBe(0)
    expect(arena.combo).toBe(0)
    expect(arena.cleared).toBe(false)
    expect(arena.goal.have).toBe(0)
    expect(arena.effects).toHaveLength(0)
    expect(arena.drainEvents()).toEqual([])
  })

  it("restarting stage 2 after clearing stage 1 keeps stage 1's points (no farming, no loss)", () => {
    const { sw, arena } = make(1)
    clearStageOne(sw, arena)
    const banked = arena.score
    arena.next()
    arena.award(500, 0, 0)
    arena.restart()
    expect(arena.stageIndex).toBe(2)
    expect(arena.score).toBe(banked)
  })

  it('destroy() frees the world', () => {
    const { arena } = make(0)
    arena.destroy()
    expect(arena.phys.props).toHaveLength(0)
  })

  it('a huge frame time is clamped, not exploded', () => {
    const { sw, arena } = make(0)
    arena.update(30, sw)
    run(sw, arena, 1)
    for (const p of arena.phys.props)
      expect(Number.isFinite(arena.phys.pos(p).x + arena.phys.pos(p).y)).toBe(true)
  })
})

describe('distractors in the real frame loop (stage 5)', () => {
  const stage = 4
  const place = (sw: Swarm, cx: number, cy: number) =>
    sw.balls.forEach((b, i) => {
      b.x = cx + ((i % 10) - 4.5) * 25
      b.y = cy + (Math.floor(i / 10) - 2.5) * 25
      b.vx = 0
      b.vy = 0
      b.lev = 1
    })
  const lantern = (a: Arena) => a.distractors.find((d) => d.kind === 'lantern')!
  const whirl = (a: Arena) => a.distractors.find((d) => d.kind === 'whirlpool')!
  const fan = (a: Arena) => a.distractors.find((d) => d.kind === 'fan')!
  const meanTo = (sw: Swarm, p: { x: number; y: number }) =>
    sw.balls.reduce((s, b) => s + Math.hypot(b.x - p.x, b.y - p.y), 0) / sw.balls.length

  it('the stage has all three kinds, placed inside the world', () => {
    const { arena } = make(stage)
    expect(arena.distractors.map((d) => d.kind).sort()).toEqual([
      'fan',
      'lantern',
      'lantern',
      'whirlpool',
    ])
    for (const d of arena.distractors) {
      expect(d.x).toBeGreaterThan(0)
      expect(d.x).toBeLessThan(W)
    }
  })

  it('a lantern lures floating balls toward it', () => {
    const { sw, arena } = make(stage)
    run(sw, arena, 0.5)
    const l = lantern(arena)
    place(sw, l.x - 600, l.y + 200)
    const before = meanTo(sw, l)
    for (let t = 0; t < 1.2; t += 1 / 60) {
      sw.step(1 / 60, input('open'))
      arena.update(1 / 60, sw)
    }
    expect(meanTo(sw, l)).toBeLessThan(before - 150)
  })

  it('a whirlpool swallows balls and spits them out at the start heap; the swarm stays at 60', () => {
    const { sw, arena } = make(stage)
    run(sw, arena, 0.5)
    const w = whirl(arena)
    place(sw, w.x + 250, w.y)
    let swallowed = 0
    for (let t = 0; t < 5; t += 1 / 60) {
      sw.step(1 / 60, input('open'))
      arena.update(1 / 60, sw)
      swallowed += arena.drainEvents().filter((e) => e.type === 'swallow').length
    }
    expect(swallowed).toBeGreaterThan(0)
    expect(sw.balls).toHaveLength(60)
    // back at the start heap, on the floor (the open palm lifts them again right away: gravity off, they float where they are)
    const home = sw.balls.filter((b) => Math.abs(b.x - W / 2) < 450 && b.y > sw.floorY - 80)
    expect(home.length).toBeGreaterThan(0) // recycled to the heap
    sw.balls.forEach((b) => {
      expect(Number.isFinite(b.x + b.y)).toBe(true)
      expect(b.x).toBeGreaterThan(0)
      expect(b.x).toBeLessThan(W)
    })
  })

  it('the fan is quiet for the first 3 s (so the stage starts calm), then blows', () => {
    const { sw, arena } = make(stage)
    const f = fan(arena) as { x: number; y: number }
    parkBalls(sw)
    place(sw, f.x, f.y)
    for (let t = 0; t < 1.5; t += 1 / 60) {
      sw.balls.forEach((b) => ((b.vx = 0), (b.vy = 0)))
      arena.update(1 / 60, sw) // (the swarm itself is not stepped: only the fan's effect is measured)
    }
    const quiet = sw.balls.reduce((s, b) => s + b.vx, 0) / sw.balls.length
    expect(Math.abs(quiet)).toBeLessThan(5)
    run(sw, arena, 2) // t is now > 3 s: blowing
    place(sw, f.x, f.y)
    for (let t = 0; t < 0.5; t += 1 / 60) arena.update(1 / 60, sw)
    const blowing = sw.balls.reduce((s, b) => s + b.vx, 0) / sw.balls.length
    expect(blowing).toBeGreaterThan(100)
  })

  it('the whole stage can be cleared by playing it: a comet through the balloons and at the gongs', () => {
    const { sw, arena } = make(stage)
    // every balloon and gong, hit in turn by a fast ball (the lanterns / fan / whirlpool are in play the whole time)
    run(sw, arena, 3)
    const targets = [...of(arena, 'balloon'), ...of(arena, 'gong')]
    for (const t of targets) {
      if (!t.alive) continue
      fire(sw, arena.phys.pos(t), 3200, 300)
      run(sw, arena, 0.5, input('open'))
    }
    expect(arena.goal.have).toBe(arena.goal.need)
    expect(arena.cleared).toBe(true)
  })
})
