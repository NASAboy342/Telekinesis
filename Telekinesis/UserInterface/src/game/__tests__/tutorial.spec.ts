import { describe, expect, it } from 'vitest'
import { STEPS, TUTORIAL, Tutorial, type Observation } from '../tutorial'

const NONE: Observation = { present: false, pose: 'none', drift: 0, pinch: 0, stopping: false }
const hand = (o: Partial<Observation>): Observation => ({ ...NONE, present: true, ...o })
/** feed `seconds` of the same observation at 30 fps; returns how many steps it completed */
function feed(t: Tutorial, o: Observation, seconds: number): number {
  let n = 0
  for (let i = 0; i < Math.round(seconds * 30); i++) if (t.update(1 / 30, o)) n++
  return n
}
/** hold whatever the current step needs, long enough, plus the settle breath */
const NEEDS: Record<string, Observation> = {
  hand: hand({ pose: 'none' }),
  lift: hand({ pose: 'open' }),
  wave: hand({ pose: 'open', drift: 1 }),
  point: hand({ pose: 'point' }),
  circle: hand({ pose: 'two' }),
  clump: hand({ pose: 'open', pinch: 1 }), // the mouse sends an open palm + a pinch
  drop: hand({ pose: 'fist' }),
  stop: hand({ pose: 'open', stopping: true }),
}

describe('Tutorial', () => {
  it('teaches every gesture of the game, each with a camera and a mouse instruction', () => {
    expect(STEPS.map((s) => s.id)).toEqual([
      'hand',
      'lift',
      'wave',
      'point',
      'circle',
      'clump',
      'drop',
      'stop',
    ])
    for (const s of STEPS) {
      expect(s.title.length).toBeGreaterThan(3)
      expect(s.hint.length).toBeGreaterThan(10)
      expect(s.mouse.length).toBeGreaterThan(5)
      expect(s.hold).toBeGreaterThan(0)
    }
  })

  it('starts at the first step and does nothing while no hand is there', () => {
    const t = new Tutorial()
    expect(t.step?.id).toBe('hand')
    expect(feed(t, NONE, 5)).toBe(0)
    expect(t.index).toBe(0)
    expect(t.progress).toBe(0)
  })

  it('a camera pinch pose counts for the clump step too', () => {
    const t = new Tutorial()
    t.index = 5
    expect(t.step?.id).toBe('clump')
    expect(feed(t, hand({ pose: 'pinch', pinch: 0.9 }), 2)).toBe(1)
  })

  it('a resting fist (the idle mouse fallback) does not count as showing a hand', () => {
    const t = new Tutorial()
    expect(feed(t, hand({ pose: 'fist' }), 3)).toBe(0)
  })

  it('a step completes only after its gesture was held long enough', () => {
    const t = new Tutorial()
    feed(t, NEEDS.hand!, 0.3)
    expect(t.progress).toBeGreaterThan(0.4)
    expect(t.index).toBe(0)
    feed(t, NEEDS.hand!, 0.4)
    expect(t.step?.id).toBe('lift')
  })

  it('letting go drains the progress, so a flicker does not complete a step', () => {
    const t = new Tutorial()
    feed(t, NEEDS.hand!, 0.4)
    const before = t.progress
    feed(t, NONE, 0.1)
    expect(t.progress).toBeLessThan(before)
    feed(t, NONE, 1)
    expect(t.progress).toBe(0)
    expect(t.index).toBe(0)
  })

  it('the wrong gesture does not count (a wave needs motion, not just an open palm)', () => {
    const t = new Tutorial()
    t.index = 2 // wave
    expect(feed(t, hand({ pose: 'open', drift: 0 }), 4)).toBe(0)
    expect(feed(t, hand({ pose: 'open', drift: TUTORIAL.waveSpeed * 0.9 }), 4)).toBe(0)
    expect(feed(t, hand({ pose: 'point', drift: 2 }), 4)).toBe(0)
    expect(feed(t, hand({ pose: 'open', drift: 1 }), 2)).toBe(1)
  })

  it('a pose held through the settle breath does not rush the next step', () => {
    const t = new Tutorial()
    feed(t, NEEDS.hand!, 0.6) // done → lift
    expect(t.step?.id).toBe('lift')
    feed(t, hand({ pose: 'open' }), TUTORIAL.settle * 0.8)
    expect(t.progress).toBe(0) // the breath is still running
    feed(t, hand({ pose: 'open' }), 1.2)
    expect(t.step?.id).toBe('wave')
  })

  it('can be played through from start to finish, and reports the step that was just done', () => {
    const t = new Tutorial()
    for (const s of STEPS) {
      expect(t.step?.id).toBe(s.id)
      feed(t, NEEDS[s.id]!, TUTORIAL.settle + s.hold + 0.3)
      expect(t.last?.id).toBe(s.id)
    }
    expect(t.done).toBe(true)
    expect(t.step).toBeNull()
    expect(t.progress).toBe(1)
    expect(feed(t, NEEDS.lift!, 3)).toBe(0) // nothing left to complete
  })

  it('skip moves on, also on the last step, and restart begins again', () => {
    const t = new Tutorial()
    t.skip()
    expect(t.step?.id).toBe('lift')
    for (let i = 0; i < STEPS.length; i++) t.skip()
    expect(t.done).toBe(true)
    t.skip() // harmless when finished
    expect(t.index).toBe(STEPS.length)
    t.restart()
    expect(t.index).toBe(0)
    expect(t.last).toBeNull()
    expect(t.held).toBe(0)
  })

  it('a stalled frame (a hidden tab) cannot complete a step on its own', () => {
    const t = new Tutorial()
    expect(t.update(30, NEEDS.hand!)).toBe(false)
    expect(t.progress).toBeLessThan(0.3)
  })
})
