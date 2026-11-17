import { describe, expect, it } from 'vitest'
import {
  handReach,
  handToSwarmInput,
  mouseToSwarmInput,
  REACH_FAR_SIZE,
  REACH_NEAR_SIZE,
  STOP_GRACE,
  STOP_HOLD,
  StopDetector,
} from '../input'
import type { HandSignals } from '@/helpers/gestures'

const hand = (over: Partial<HandSignals> = {}): HandSignals => ({
  side: 'right',
  pose: 'open',
  facing: { state: 'palm', score: 1, winding: 1, depth: 0 },
  pointDir: { x: 0, y: -1 },
  pinchAmount: 0,
  pinching: false,
  openness: 1,
  extended: [true, true, true, true, true],
  palm: { x: 0.5, y: 0.5 },
  size: 0.2,
  velocity: { x: 0.8, y: -0.2 },
  speed: 0.82,
  ...over,
})

describe('handReach: how close the hand is, from its size on screen', () => {
  it('maps far → 0, near → 1, a comfortable distance → the middle', () => {
    expect(handReach(REACH_FAR_SIZE)).toBe(0)
    expect(handReach(REACH_NEAR_SIZE)).toBe(1)
    expect(handReach(0.2)).toBeCloseTo(0.5)
    expect(handReach(0.02)).toBe(0)
    expect(handReach(0.9)).toBe(1)
    expect(handReach(0.15)).toBeLessThan(handReach(0.25)) // bigger on screen = closer = more reach
  })
  it('falls back to the middle for junk', () => {
    expect(handReach(Number.NaN)).toBe(0.5)
  })
})

describe('handToSwarmInput', () => {
  it('open palm passes the hand motion and the reach on', () => {
    const i = handToSwarmInput(hand({ size: 0.3 }))
    expect(i.pose).toBe('open')
    expect(i.drift).toEqual({ x: 0.8, y: -0.2 })
    expect(i.reach).toBe(1)
  })
  it('other poses do not pass the motion on', () => {
    for (const pose of ['fist', 'pinch', 'point', 'two'] as const) {
      expect(handToSwarmInput(hand({ pose })).drift, pose).toEqual({ x: 0, y: 0 })
    }
  })
  it('no hand: nothing', () => {
    const i = handToSwarmInput(undefined)
    expect(i.present).toBe(false)
    expect(i.reach).toBe(0.5)
  })
})

describe('mouseToSwarmInput', () => {
  it('holding = open palm with the pointer motion and the wheel as the hand distance', () => {
    const i = mouseToSwarmInput(true, false, false, { x: 0, y: 0 }, { x: 0.5, y: 0 }, 0.9)
    expect(i.pose).toBe('open')
    expect(i.drift).toEqual({ x: 0.5, y: 0 })
    expect(i.reach).toBe(0.9)
  })
  it('released = fist, no drift; shift = circle; keys = point', () => {
    expect(mouseToSwarmInput(false, false, false, { x: 0, y: 0 }, { x: 1, y: 0 }).drift).toEqual({
      x: 0,
      y: 0,
    })
    expect(mouseToSwarmInput(true, true, false, { x: 0, y: 0 }, { x: 1, y: 0 }).pose).toBe('two')
    expect(mouseToSwarmInput(true, false, false, { x: 1, y: 0 }, { x: 1, y: 0 }).pose).toBe('point')
  })
})

describe('StopDetector: both hands open, held briefly', () => {
  const left = (over: Partial<HandSignals> = {}) => hand({ side: 'left', ...over })
  const right = (over: Partial<HandSignals> = {}) => hand({ side: 'right', ...over })
  /** feed the same signals at 30 fps for `seconds`, returning the answer at the end */
  const feed = (d: StopDetector, signals: HandSignals[], from: number, seconds: number) => {
    let on = false
    for (let t = from; t <= from + seconds + 1e-9; t += 1 / 30) on = d.update(signals, t)
    return on
  }

  it('needs both hands open for the hold time before it counts', () => {
    const d = new StopDetector()
    expect(feed(d, [left(), right()], 0, STOP_HOLD * 0.6)).toBe(false) // not yet
    expect(feed(d, [left(), right()], STOP_HOLD * 0.6, STOP_HOLD)).toBe(true)
  })

  it('one hand, or two hands that are not both open, never counts', () => {
    expect(feed(new StopDetector(), [right()], 0, 3)).toBe(false)
    expect(feed(new StopDetector(), [left({ pose: 'fist' }), right()], 0, 3)).toBe(false)
    expect(feed(new StopDetector(), [left({ pose: 'point' }), right({ pose: 'two' })], 0, 3)).toBe(
      false,
    )
    expect(feed(new StopDetector(), [], 0, 3)).toBe(false)
  })

  it('a hand flickering for a frame or two does not release it, but leaving does', () => {
    const d = new StopDetector()
    expect(feed(d, [left(), right()], 0, 1)).toBe(true)
    expect(d.update([right()], 1.04)).toBe(true) // one frame of lost tracking
    expect(d.update([left(), right()], 1.07)).toBe(true)
    expect(feed(d, [right()], 1.1, STOP_GRACE + 0.2)).toBe(false) // really gone
  })

  it('an accidental brief second open hand does not trigger it', () => {
    const d = new StopDetector()
    expect(feed(d, [left(), right()], 0, 0.15)).toBe(false)
    expect(feed(d, [right()], 0.2, 1)).toBe(false)
    expect(feed(d, [left(), right()], 1.3, 0.15)).toBe(false) // the hold timer restarted
  })
})

describe('mouse stop (Space)', () => {
  it('Space while holding = both hands open: open pose + stop, nothing else', () => {
    const i = mouseToSwarmInput(true, true, false, { x: 1, y: 0 }, { x: 1, y: 0 }, 0.5, true)
    expect(i.stop).toBe(true)
    expect(i.pose).toBe('open')
    expect(i.dir).toEqual({ x: 0, y: 0 })
    expect(i.drift).toEqual({ x: 0, y: 0 })
  })
  it('no Space, or the mouse released: no stop', () => {
    expect(mouseToSwarmInput(true, false, false, { x: 0, y: 0 }).stop).toBe(false)
    expect(
      mouseToSwarmInput(false, false, false, { x: 0, y: 0 }, { x: 0, y: 0 }, 0.5, true).stop,
    ).toBe(false)
  })
  it('hand input carries the stop flag', () => {
    expect(handToSwarmInput(hand(), true).stop).toBe(true)
    expect(handToSwarmInput(hand()).stop).toBe(false)
    expect(handToSwarmInput(undefined).stop).toBe(false)
  })
})
