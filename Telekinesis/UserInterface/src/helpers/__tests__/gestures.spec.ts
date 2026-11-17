import { describe, expect, it } from 'vitest'
import {
  GestureTracker,
  classify,
  createDistance,
  facingCues,
  fingerStates,
  type Pt,
} from '../gestures'
import { OneEuro } from '../oneEuro'

interface HandOpts {
  /** [thumb, index, middle, ring, pinky] */
  extended: boolean[]
  pinch?: boolean
  /** radians the whole hand is rotated about the wrist */
  rotate?: number
  at?: { x: number; y: number }
  /** depth of the fingertips relative to the knuckles (negative = closer to the camera) */
  tipZ?: number
  /** mirror the hand left↔right (= the other hand, or the same hand turned over) */
  mirrorX?: boolean
  /** squash the hand sideways (0.03 = seen edge-on) */
  flat?: number
}

/** Synthetic 21-point hand, fingers pointing "up" (negative y) before rotation. */
function makeHand({
  extended,
  pinch = false,
  rotate = 0,
  at = { x: 0.5, y: 0.8 },
  tipZ = 0,
  mirrorX = false,
  flat = 1,
}: HandOpts): Pt[] {
  const lm: Pt[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))
  const TIP_IDS = [4, 8, 12, 16, 20]
  const set = (i: number, x: number, y: number) =>
    (lm[i] = { x, y, z: TIP_IDS.includes(i) ? tipZ : 0 })
  set(0, 0, 0)
  const cols = [-0.04, -0.013, 0.013, 0.04] // index..pinky x offsets
  const mcpY = -0.15
  ;[5, 9, 13, 17].forEach((mcp, f) => {
    const x = cols[f]!
    set(mcp, x, mcpY)
    const up = extended[f + 1]
    set(mcp + 1, x, up ? -0.25 : -0.22) // pip
    set(mcp + 2, x, up ? -0.31 : -0.2) // dip
    set(mcp + 3, x, up ? -0.38 : -0.16) // tip (curled: back toward the wrist)
  })
  const t = extended[0]
  set(1, -0.05, -0.04)
  set(2, -0.08, -0.08)
  set(3, t ? -0.13 : -0.07, t ? -0.12 : -0.14)
  set(4, t ? -0.2 : -0.0, t ? -0.16 : -0.15)
  if (pinch) set(4, lm[8]!.x - 0.01, lm[8]!.y + 0.01)
  const c = Math.cos(rotate)
  const s = Math.sin(rotate)
  return lm.map((p) => {
    const px = (mirrorX ? -p.x : p.x) * flat
    return { x: at.x + px * c - p.y * s, y: at.y + px * s + p.y * c, z: p.z }
  })
}

const dist = createDistance(1)
const OPEN = [true, true, true, true, true]
const FIST = [false, false, false, false, false]
const POINT = [false, true, false, false, false]
const TWO = [false, true, true, false, false]

describe('finger states + classify', () => {
  it('open palm', () => {
    const e = fingerStates(makeHand({ extended: OPEN }), dist)
    expect(e).toEqual(OPEN)
    expect(classify(e, false)).toBe('open')
  })
  it('fist', () => {
    const e = fingerStates(makeHand({ extended: FIST }), dist)
    expect(e.slice(1)).toEqual([false, false, false, false])
    expect(classify(e, false)).toBe('fist')
  })
  it('point = index only', () => {
    expect(classify(fingerStates(makeHand({ extended: POINT }), dist), false)).toBe('point')
  })
  it('two fingers = index + middle only (not point, not open)', () => {
    const e = fingerStates(makeHand({ extended: TWO }), dist)
    expect(classify(e, false)).toBe('two')
    expect(classify([true, true, true, false, false], false)).toBe('two') // thumb position doesn't matter
    expect(classify([false, true, false, true, false], false)).toBe('none') // index + ring is not a gesture
    expect(classify([false, true, true, true, false], false)).toBe('open') // three fingers still counts as open
  })
  it('pinch wins over everything', () => {
    expect(classify(OPEN, true)).toBe('pinch')
  })
  it('is independent of hand rotation (upside-down camera / hand)', () => {
    for (const rotate of [0, Math.PI / 2, Math.PI, -1]) {
      expect(
        classify(fingerStates(makeHand({ extended: OPEN, rotate }), dist), false),
        `open ${rotate}`,
      ).toBe('open')
      expect(
        classify(fingerStates(makeHand({ extended: FIST, rotate }), dist), false),
        `fist ${rotate}`,
      ).toBe('fist')
      expect(
        classify(fingerStates(makeHand({ extended: POINT, rotate }), dist), false),
        `point ${rotate}`,
      ).toBe('point')
    }
  })
})

describe('GestureTracker', () => {
  const run = (tracker: GestureTracker, hand: Pt[], frames: number, t0 = 0, label = 'Left') => {
    let last = tracker.update([hand], [label], 1, t0)
    for (let i = 1; i < frames; i++) last = tracker.update([hand], [label], 1, t0 + i / 30)
    return last[0]!
  }

  it('debounces pose changes over a few frames', () => {
    const tr = new GestureTracker()
    run(tr, makeHand({ extended: OPEN }), 5)
    const first = tr.update([makeHand({ extended: FIST })], ['Left'], 1, 1)[0]!
    expect(first.pose).toBe('open') // one fist frame is not enough
    const settled = run(tr, makeHand({ extended: FIST }), 5, 1.1)
    expect(settled.pose).toBe('fist')
  })

  it('pinch has hysteresis and reports pinchAmount', () => {
    const tr = new GestureTracker()
    const pinched = run(tr, makeHand({ extended: OPEN, pinch: true }), 6)
    expect(pinched.pinching).toBe(true)
    expect(pinched.pose).toBe('pinch')
    expect(pinched.pinchAmount).toBeGreaterThan(0.8)
    const released = run(tr, makeHand({ extended: OPEN }), 6, 1)
    expect(released.pinching).toBe(false)
    expect(released.pose).toBe('open')
    expect(released.pinchAmount).toBeLessThan(0.3)
  })

  it('palm is mirrored and tracks velocity', () => {
    const tr = new GestureTracker()
    const a = run(tr, makeHand({ extended: OPEN, at: { x: 0.2, y: 0.8 } }), 3)
    expect(a.palm.x).toBeGreaterThan(0.7) // hand on the left of the raw frame → right side of the mirrored screen
    let last = a
    for (let i = 0; i < 20; i++)
      last = tr.update(
        [makeHand({ extended: OPEN, at: { x: 0.2 + i * 0.02, y: 0.8 } })],
        ['Left'],
        1,
        1 + i / 30,
      )[0]!
    expect(last.velocity.x).toBeLessThan(0) // raw x grows → mirrored x shrinks
    expect(last.speed).toBeGreaterThan(0.1)
  })

  it('maps MediaPipe labels to the user side and handles two hands', () => {
    const tr = new GestureTracker()
    const out = tr.update(
      [makeHand({ extended: OPEN }), makeHand({ extended: FIST })],
      ['Left', 'Right'],
      1,
      0,
    )
    expect(out.map((h) => h.side).sort()).toEqual(['left', 'right'])
  })

  it("uses MediaPipe's label as the user's own hand", () => {
    const tr = new GestureTracker()
    expect(tr.update([makeHand({ extended: OPEN })], ['Right'], 1, 0)[0]!.side).toBe('right')
    expect(
      new GestureTracker().update([makeHand({ extended: OPEN })], ['Left'], 1, 0)[0]!.side,
    ).toBe('left')
  })

  it('forgets a hand that disappears', () => {
    const tr = new GestureTracker()
    run(tr, makeHand({ extended: FIST }), 6)
    tr.update([], [], 1, 1)
    const back = tr.update([makeHand({ extended: OPEN })], ['Left'], 1, 2)[0]!
    expect(back.pose).toBe('none') // fresh state, nothing debounced yet
  })
})

describe('pointing direction', () => {
  const settle = (rotate: number) => {
    const tr = new GestureTracker()
    let out = tr.update([makeHand({ extended: POINT, rotate })], ['Right'], 1, 0)[0]!
    for (let i = 1; i < 30; i++)
      out = tr.update([makeHand({ extended: POINT, rotate })], ['Right'], 1, i / 30)[0]!
    return out
  }
  it('finger up in the picture → up on screen', () => {
    const h = settle(0)
    expect(h.pose).toBe('point')
    expect(h.pointDir.y).toBeLessThan(-0.95)
    expect(Math.abs(h.pointDir.x)).toBeLessThan(0.1)
  })
  it('finger to the right of the user → right on screen (mirror)', () => {
    // rotating the raw hand so the finger points to the left of the raw frame = the user's right
    const h = settle(-Math.PI / 2)
    expect(h.pointDir.x).toBeGreaterThan(0.95)
    expect(Math.abs(h.pointDir.y)).toBeLessThan(0.1)
  })
  it('finger to the left of the user → left on screen', () => {
    expect(settle(Math.PI / 2).pointDir.x).toBeLessThan(-0.95)
  })
  it('finger down → down on screen; the vector is always unit length', () => {
    const h = settle(Math.PI)
    expect(h.pointDir.y).toBeGreaterThan(0.95)
    expect(Math.hypot(h.pointDir.x, h.pointDir.y)).toBeCloseTo(1, 5)
  })
})

describe('facing: palm or back of the hand toward the camera', () => {
  const size = 0.15 // wrist → middle knuckle in the synthetic hand
  const cues = (opts: HandOpts, label: string) => facingCues(makeHand(opts), label, 1, size)
  // the synthetic hand has its index knuckle on the image-left of its pinky: that is a LEFT hand with the palm to the camera
  // (or a RIGHT hand seen from the back)

  it('winding: palm vs back follows the hand label', () => {
    expect(cues({ extended: OPEN }, 'Left').winding).toBeGreaterThan(0.5)
    expect(cues({ extended: OPEN }, 'Right').winding).toBeLessThan(-0.5)
    expect(cues({ extended: OPEN, mirrorX: true }, 'Right').winding).toBeGreaterThan(0.5)
    expect(cues({ extended: OPEN, mirrorX: true }, 'Left').winding).toBeLessThan(-0.5)
  })

  it('winding works for a fist exactly as for an open hand (the knuckles do not move)', () => {
    expect(cues({ extended: FIST }, 'Left').winding).toBeGreaterThan(0.5)
    expect(cues({ extended: FIST, mirrorX: true }, 'Left').winding).toBeLessThan(-0.5)
  })

  it('winding does not depend on how the hand or the camera is rotated', () => {
    for (const rotate of [Math.PI, Math.PI / 2, -1, 2.5]) {
      expect(cues({ extended: FIST, rotate }, 'Left').winding, `palm ${rotate}`).toBeGreaterThan(
        0.5,
      )
      expect(
        cues({ extended: FIST, rotate, mirrorX: true }, 'Left').winding,
        `back ${rotate}`,
      ).toBeLessThan(-0.5)
    }
  })

  it('winding fades to ~0 when the hand is edge-on', () => {
    expect(Math.abs(cues({ extended: FIST, flat: 0.03 }, 'Left').winding)).toBeLessThan(0.3)
  })

  it('depth: curled fingertips in front of the knuckles = palm to the camera, behind = back', () => {
    expect(cues({ extended: FIST, tipZ: -0.06 }, 'Left').depth).toBeGreaterThan(0.5)
    expect(cues({ extended: FIST, tipZ: 0.06 }, 'Left').depth).toBeLessThan(-0.5)
    expect(Math.abs(cues({ extended: FIST }, 'Left').depth)).toBeLessThan(1e-9) // no depth info → no vote
  })

  const settle = (opts: HandOpts, label: string, frames = 20) => {
    const tr = new GestureTracker()
    let out = tr.update([makeHand(opts)], [label], 1, 0)[0]!
    for (let i = 1; i < frames; i++) out = tr.update([makeHand(opts)], [label], 1, i / 30)[0]!
    return out
  }

  it('tracker: a fist toward the camera reports palm, a fist turned over reports back', () => {
    const towards = settle({ extended: FIST, tipZ: -0.05 }, 'Left')
    expect(towards.pose).toBe('fist')
    expect(towards.facing.state).toBe('palm')
    expect(towards.facing.score).toBeGreaterThan(0.5)
    const away = settle({ extended: FIST, tipZ: 0.05, mirrorX: true }, 'Left')
    expect(away.pose).toBe('open') // …and a fist seen from the back counts as an open palm
    expect(away.facing.state).toBe('back')
    expect(away.facing.score).toBeLessThan(-0.5)
  })

  it('tracker: the same holds for the right hand and when the hand is rotated', () => {
    expect(
      settle({ extended: FIST, tipZ: -0.05, mirrorX: true, rotate: Math.PI }, 'Right').facing.state,
    ).toBe('palm')
    expect(settle({ extended: FIST, tipZ: 0.05, rotate: 2 }, 'Right').facing.state).toBe('back')
  })

  it('tracker: an open hand turned over also reports back (depth has no say when the fingers are open)', () => {
    expect(settle({ extended: OPEN, tipZ: 0.05 }, 'Left').facing.state).toBe('palm')
    expect(settle({ extended: OPEN, tipZ: -0.05, mirrorX: true }, 'Left').facing.state).toBe('back')
  })

  it('tracker: when the hand is edge-on, depth decides for a fist', () => {
    expect(settle({ extended: FIST, flat: 0.02, tipZ: -0.06 }, 'Left').facing.state).toBe('palm')
    expect(settle({ extended: FIST, flat: 0.02, tipZ: 0.06 }, 'Left').facing.state).toBe('back')
  })

  it('tracker: smoothing + dead zone — a briefly ambiguous hand does not flip the answer', () => {
    const tr = new GestureTracker()
    let flips = 0
    let prev = ''
    for (let i = 0; i < 60; i++) {
      // a clear palm, but every other frame is seen almost edge-on (winding ≈ 0, no depth info)
      const opts: HandOpts =
        i % 2 ? { extended: FIST, flat: 0.02 } : { extended: FIST, tipZ: -0.05 }
      const f = tr.update([makeHand(opts)], ['Left'], 1, i / 30)[0]!.facing.state
      if (prev && f !== prev) flips++
      prev = f
    }
    expect(prev).toBe('palm')
    expect(flips).toBe(0)
  })

  it('tracker: turning the hand over flips the answer within a handful of frames', () => {
    const tr = new GestureTracker()
    for (let i = 0; i < 20; i++)
      tr.update([makeHand({ extended: FIST, tipZ: -0.05 })], ['Left'], 1, i / 30)
    let framesToFlip = 0
    let state = 'palm'
    while (state === 'palm' && framesToFlip < 30) {
      framesToFlip++
      state = tr.update(
        [makeHand({ extended: FIST, tipZ: 0.05, mirrorX: true })],
        ['Left'],
        1,
        (20 + framesToFlip) / 30,
      )[0]!.facing.state
    }
    expect(state).toBe('back')
    expect(framesToFlip).toBeLessThanOrEqual(8)
  })
})

describe('a fist only counts when the palm side faces the camera', () => {
  const settle = (opts: HandOpts, label = 'Left', frames = 20) => {
    const tr = new GestureTracker()
    let out = tr.update([makeHand(opts)], [label], 1, 0)[0]!
    for (let i = 1; i < frames; i++) out = tr.update([makeHand(opts)], [label], 1, i / 30)[0]!
    return out
  }

  it('classify: back-facing fist = open, palm-facing fist = fist, other poses ignore facing', () => {
    expect(classify(FIST, false, 'palm')).toBe('fist')
    expect(classify(FIST, false, 'back')).toBe('open')
    expect(classify(OPEN, false, 'back')).toBe('open')
    expect(classify(POINT, false, 'back')).toBe('point')
    expect(classify(TWO, false, 'back')).toBe('two')
    expect(classify(FIST, true, 'back')).toBe('pinch')
    expect(classify(FIST, false)).toBe('fist') // default: palm
  })

  it('tracker: fist toward the camera → fist; fist turned over → open (both hands, any rotation)', () => {
    expect(settle({ extended: FIST, tipZ: -0.05 }, 'Left').pose).toBe('fist')
    expect(settle({ extended: FIST, tipZ: 0.05, mirrorX: true }, 'Left').pose).toBe('open')
    expect(settle({ extended: FIST, tipZ: -0.05, mirrorX: true }, 'Right').pose).toBe('fist')
    expect(settle({ extended: FIST, tipZ: 0.05 }, 'Right').pose).toBe('open')
    expect(settle({ extended: FIST, tipZ: -0.05, rotate: Math.PI }, 'Left').pose).toBe('fist')
    expect(
      settle({ extended: FIST, tipZ: 0.05, mirrorX: true, rotate: Math.PI }, 'Left').pose,
    ).toBe('open')
  })

  it('tracker: a hand that first appears as a back-facing fist is open straight away (no made-up default)', () => {
    const tr = new GestureTracker()
    const opts: HandOpts = { extended: FIST, tipZ: 0.05, mirrorX: true }
    let pose = ''
    for (let i = 0; i < 4; i++) pose = tr.update([makeHand(opts)], ['Left'], 1, i / 30)[0]!.pose
    expect(pose).toBe('open')
  })

  it('tracker: turning a fist over switches fist → open within a few frames; back again switches it back', () => {
    const tr = new GestureTracker()
    const palm: HandOpts = { extended: FIST, tipZ: -0.05 }
    const back: HandOpts = { extended: FIST, tipZ: 0.05, mirrorX: true }
    let t = 0
    const feed = (o: HandOpts, n: number) => {
      let pose = ''
      for (let i = 0; i < n; i++) pose = tr.update([makeHand(o)], ['Left'], 1, t++ / 30)[0]!.pose
      return pose
    }
    expect(feed(palm, 20)).toBe('fist')
    expect(feed(back, 12)).toBe('open')
    expect(feed(palm, 12)).toBe('fist')
  })

  it('tracker: a fist briefly seen edge-on does not flicker between fist and open', () => {
    const tr = new GestureTracker()
    const poses: string[] = []
    for (let i = 0; i < 60; i++) {
      const opts: HandOpts =
        i % 2 ? { extended: FIST, flat: 0.02 } : { extended: FIST, tipZ: -0.05 }
      poses.push(tr.update([makeHand(opts)], ['Left'], 1, i / 30)[0]!.pose)
    }
    expect(poses.includes('open')).toBe(false)
    expect(poses.slice(5).every((p) => p === 'fist')).toBe(true)
  })
})

describe('OneEuro', () => {
  it('damps jitter around a still value', () => {
    const f = new OneEuro()
    let max = 0
    for (let i = 0; i < 60; i++) {
      const v = f.filter(0.5 + (i % 2 ? 0.01 : -0.01), i / 30)
      if (i > 10) max = Math.max(max, Math.abs(v - 0.5))
    }
    expect(max).toBeLessThan(0.008)
  })
  it('follows a fast move', () => {
    const f = new OneEuro()
    f.filter(0, 0)
    let v = 0
    for (let i = 1; i <= 10; i++) v = f.filter(i * 0.1, i / 30)
    expect(v).toBeGreaterThan(0.6)
  })
})
