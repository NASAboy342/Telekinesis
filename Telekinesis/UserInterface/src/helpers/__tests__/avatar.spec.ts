import { describe, expect, it } from 'vitest'
import { AVATAR, AvatarSmoother, OPEN_HAND_LOCAL, openHandRaw } from '../avatar'
import type { Pt } from '../gestures'

const ASPECT = 4 / 3
const FPS = 30
const PALM_IDS = [0, 5, 9, 13, 17]

/** small deterministic noise generator (mulberry32) → roughly gaussian via the sum of 4 uniforms */
function rng(seed: number) {
  let a = seed >>> 0
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return () => (u() + u() + u() + u() - 2) * Math.sqrt(3) // mean 0, sd ≈ 1
}

/** the open hand with its wrist at `at`, scaled by `scale` (a bigger scale = the hand is closer to the camera) */
function handAt(
  at: { x: number; y: number },
  scale = 1,
  noise = 0,
  rand = rng(1),
  aspect = ASPECT,
): Pt[] {
  // x is a fraction of the frame WIDTH, y of its HEIGHT: a physically round hand is 1/aspect as wide in x units
  return openHandRaw().map((p) => ({
    x: at.x + (p.x * scale) / aspect + (noise ? rand() * noise : 0),
    y: at.y + p.y * scale + (noise ? rand() * noise : 0),
  }))
}

const palmCentre = (lm: Pt[]) => ({
  x: PALM_IDS.reduce((a, id) => a + lm[id]!.x, 0) / PALM_IDS.length,
  y: PALM_IDS.reduce((a, id) => a + lm[id]!.y, 0) / PALM_IDS.length,
})
const rms = (v: number[]) => Math.sqrt(v.reduce((a, x) => a + x * x, 0) / v.length)
/** how big the avatar is: wrist → middle fingertip, in hand units */
const extent = (local: { x: number; y: number }[]) =>
  Math.hypot(local[0]!.x - local[12]!.x, local[0]!.y - local[12]!.y)

describe('AvatarSmoother', () => {
  it('cuts the tracking jitter of a hand held still (position and fingers)', () => {
    const at = { x: 0.4, y: 0.8 }
    const rand = rng(7)
    const sm = new AvatarSmoother()
    const truth = palmCentre(handAt(at))
    const rawErr: number[] = []
    const outErr: number[] = []
    const rawLocalErr: number[] = []
    const outLocalErr: number[] = []
    for (let i = 0; i < 150; i++) {
      const lm = handAt(at, 1, 0.006, rand) // ≈ 4 px of jitter on a 700 px frame
      const pose = sm.update(lm, ASPECT, i / FPS)
      if (i < 20) continue // warm-up
      const c = palmCentre(lm)
      rawErr.push(Math.hypot((c.x - truth.x) * ASPECT, c.y - truth.y), 0)
      outErr.push(Math.hypot((pose.x - (1 - truth.x)) * ASPECT, pose.y - truth.y), 0)
      const size = Math.hypot((lm[0]!.x - lm[9]!.x) * ASPECT, lm[0]!.y - lm[9]!.y)
      lm.forEach((p, k) => {
        const rx = (-(p.x - c.x) * ASPECT) / size
        const ry = (p.y - c.y) / size
        rawLocalErr.push(rx - OPEN_HAND_LOCAL[k]!.x, ry - OPEN_HAND_LOCAL[k]!.y)
        outLocalErr.push(
          pose.local[k]!.x - OPEN_HAND_LOCAL[k]!.x,
          pose.local[k]!.y - OPEN_HAND_LOCAL[k]!.y,
        )
      })
    }
    expect(rms(outErr)).toBeLessThan(rms(rawErr) * 0.3) // the avatar barely moves…
    expect(rms(outErr) * 700).toBeLessThan(0.8) // …under a pixel of wobble at 700 px
    expect(rms(outLocalErr)).toBeLessThan(rms(rawLocalErr) * 0.45) // fingers: much steadier too
  })

  it('a perfectly still hand is perfectly still (the dead-band swallows micro wobble)', () => {
    const sm = new AvatarSmoother()
    const rand = rng(3)
    let last = { x: 0, y: 0 }
    let moves = 0
    for (let i = 0; i < 120; i++) {
      const pose = sm.update(handAt({ x: 0.5, y: 0.7 }, 1, 0.0015, rand), ASPECT, i / FPS)
      if (i > 30 && (pose.x !== last.x || pose.y !== last.y)) moves++
      last = { x: pose.x, y: pose.y }
    }
    expect(moves).toBeLessThan(30) // it holds its place most of the time instead of trembling on every frame
  })

  it('still follows a hand that moves: small lag, and it settles', () => {
    const sm = new AvatarSmoother()
    const from = 0.3
    const to = 0.7
    const frames = 15 // 0.5 s → 0.8 frame-heights/s·aspect
    let pose = sm.update(handAt({ x: from, y: 0.7 }), ASPECT, 0)
    let atEndOfMove = pose
    for (let i = 1; i <= 45; i++) {
      const x = i <= frames ? from + ((to - from) * i) / frames : to
      pose = sm.update(handAt({ x, y: 0.7 }), ASPECT, i / FPS)
      if (i === frames) atEndOfMove = pose
    }
    const truth = 1 - palmCentre(handAt({ x: to, y: 0.7 })).x
    expect(Math.abs(atEndOfMove.x - truth)).toBeLessThan(0.06) // ≲ 0.08 s behind a brisk move
    expect(Math.abs(pose.x - truth)).toBeLessThan(0.01) // and it has arrived 1 s later
  })

  it('is mirrored: moving the hand right in the camera image moves the avatar left (like a mirror)', () => {
    const sm = new AvatarSmoother()
    const a = sm.update(handAt({ x: 0.3, y: 0.7 }), ASPECT, 0)
    let b = a
    for (let i = 1; i < 30; i++) b = sm.update(handAt({ x: 0.5, y: 0.7 }), ASPECT, i / FPS)
    expect(b.x).toBeLessThan(a.x)
  })

  it('keeps its size when the hand moves closer to / further from the camera', () => {
    const sm = new AvatarSmoother()
    const sizes: number[] = []
    let t = 0
    let scale = 1
    /** change the camera-side scale of the hand to `to` over `ramp` frames (≈ 0.4 s), then hold for `hold` frames */
    const go = (to: number, ramp: number, hold: number) => {
      const from = scale
      for (let i = 1; i <= ramp + hold; i++) {
        scale = i <= ramp ? from + ((to - from) * i) / ramp : to
        sizes.push(extent(sm.update(handAt({ x: 0.5, y: 0.8 }, scale), ASPECT, t++ / FPS).local))
      }
    }
    go(1, 1, 44)
    const base = sizes[sizes.length - 1]!
    sizes.length = 0
    go(1.5, 12, 33) // the hand comes much closer: it looks 1.5× bigger to the camera
    expect(Math.max(...sizes)).toBeLessThan(base * 1.2) // at most a brief swell…
    expect(Math.abs(sizes[sizes.length - 1]! - base) / base).toBeLessThan(0.04) // …then the same size again
    sizes.length = 0
    go(0.7, 12, 33) // and further away than it started
    expect(Math.min(...sizes)).toBeGreaterThan(base * 0.8)
    expect(Math.abs(sizes[sizes.length - 1]! - base) / base).toBeLessThan(0.04)
  })

  it('size does not depend on the camera frame shape either', () => {
    const wide = new AvatarSmoother()
    const tall = new AvatarSmoother()
    const at = { x: 0.5, y: 0.8 }
    let a = wide.update(handAt(at, 1, 0, rng(1), 16 / 9), 16 / 9, 0)
    let b = tall.update(handAt(at, 1, 0, rng(1), 4 / 3), 4 / 3, 0)
    for (let i = 1; i < 30; i++) {
      a = wide.update(handAt(at, 1, 0, rng(1), 16 / 9), 16 / 9, i / FPS)
      b = tall.update(handAt(at, 1, 0, rng(1), 4 / 3), 4 / 3, i / FPS)
    }
    // the same physical hand gives the same avatar in a 16:9 and in a 4:3 camera frame
    expect(extent(a.local)).toBeCloseTo(extent(b.local), 3)
    expect(a.local[8]!.x).toBeCloseTo(b.local[8]!.x, 3)
  })

  it('reset() forgets the past: no smoothing across a gap, the first frame is taken as read', () => {
    const sm = new AvatarSmoother()
    for (let i = 0; i < 30; i++) sm.update(handAt({ x: 0.2, y: 0.7 }), ASPECT, i / FPS)
    sm.reset()
    const pose = sm.update(handAt({ x: 0.8, y: 0.3 }), ASPECT, 2)
    expect(pose.x).toBeCloseTo(1 - palmCentre(handAt({ x: 0.8, y: 0.3 })).x, 6)
    expect(pose.y).toBeCloseTo(palmCentre(handAt({ x: 0.8, y: 0.3 })).y, 6)
  })

  it('mouse fallback: the pointer gets the same steady position and a canned open hand', () => {
    const sm = new AvatarSmoother()
    const rand = rng(11)
    const rawErr: number[] = []
    const outErr: number[] = []
    for (let i = 0; i < 120; i++) {
      const nx = 0.5 + rand() * 0.004
      const ny = 0.4 + rand() * 0.004
      const pose = sm.updateFromPoint(nx, ny, ASPECT, i / FPS)
      if (i < 20) continue
      rawErr.push(Math.hypot((nx - 0.5) * ASPECT, ny - 0.4))
      outErr.push(Math.hypot((pose.x - 0.5) * ASPECT, pose.y - 0.4))
      expect(pose.local).toHaveLength(21)
    }
    expect(rms(outErr)).toBeLessThan(rms(rawErr) * 0.4)
    expect(extent(sm.updateFromPoint(0.5, 0.4, ASPECT, 10).local)).toBeCloseTo(
      extent([...OPEN_HAND_LOCAL]),
      6,
    )
  })

  it('the avatar is drawn small: its pixel size comes from AVATAR.handPx', () => {
    expect(AVATAR.handPx).toBeGreaterThan(10)
    expect(AVATAR.handPx).toBeLessThan(60)
  })
})
