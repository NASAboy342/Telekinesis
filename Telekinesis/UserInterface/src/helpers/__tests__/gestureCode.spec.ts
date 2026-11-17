import { describe, expect, it } from 'vitest'
import { CODE_HOLD, CODE_TOTAL, GESTURE_CODE, GestureCode } from '../gestureCode'
import type { Pose } from '../gestures'

const DT = 1 / 30

/** feed `pose` for `seconds` starting at `t`; returns [new time, whether the code completed meanwhile] */
function hold(code: GestureCode, pose: Pose | null, seconds: number, t: number): [number, boolean] {
  let done = false
  const end = t + seconds
  for (; t < end - 1e-9; t += DT) if (code.update(pose, t)) done = true
  return [t, done]
}

/** perform the whole code, each pose held `each` seconds with `gap` seconds of no hand between them */
function perform(code: GestureCode, t: number, each = CODE_HOLD + 0.1, gap = 0): [number, boolean] {
  let done = false
  for (const pose of GESTURE_CODE) {
    let d: boolean
    ;[t, d] = hold(code, pose, each, t)
    done ||= d
    if (gap) [t] = hold(code, null, gap, t)
  }
  return [t, done]
}

describe('GestureCode', () => {
  it('the code counts up with the fingers: fist, point, two fingers, open palm', () => {
    expect([...GESTURE_CODE]).toEqual(['fist', 'point', 'two', 'open'])
  })

  it('completes once when the whole code is performed in order', () => {
    const code = new GestureCode()
    const [, done] = perform(code, 0)
    expect(done).toBe(true)
    expect(code.progress).toBe(0) // ready for the next time
  })

  it('reports progress as the steps are confirmed', () => {
    const code = new GestureCode()
    let t = 0
    ;[t] = hold(code, 'fist', CODE_HOLD + 0.1, t)
    expect(code.progress).toBe(1)
    ;[t] = hold(code, 'point', CODE_HOLD + 0.1, t)
    expect(code.progress).toBe(2)
    ;[t] = hold(code, 'two', CODE_HOLD + 0.1, t)
    expect(code.progress).toBe(3)
    const [, done] = hold(code, 'open', CODE_HOLD + 0.1, t)
    expect(done).toBe(true)
  })

  it('a pose that is not held long enough does not count', () => {
    const code = new GestureCode()
    let t = 0
    ;[t] = hold(code, 'fist', CODE_HOLD * 0.6, t)
    expect(code.progress).toBe(0)
    ;[t] = hold(code, 'fist', CODE_HOLD, t)
    expect(code.progress).toBe(1)
    ;[t] = hold(code, 'point', CODE_HOLD * 0.5, t) // too short
    ;[t] = hold(code, 'two', CODE_HOLD * 0.5, t)
    expect(code.progress).toBe(1) // nothing was confirmed, and nothing was a mistake either
    const [, done] = hold(code, 'point', CODE_HOLD + 0.1, t)
    expect(done).toBe(false)
    expect(code.progress).toBe(2)
  })

  it('the hand dropping out of view in between does not break it', () => {
    const code = new GestureCode()
    const [, done] = perform(code, 0, CODE_HOLD + 0.1, 0.4)
    expect(done).toBe(true)
  })

  it('a wrong pose held for a moment starts the code again', () => {
    const code = new GestureCode()
    let t = 0
    ;[t] = hold(code, 'fist', CODE_HOLD + 0.1, t)
    ;[t] = hold(code, 'point', CODE_HOLD + 0.1, t)
    ;[t] = hold(code, 'pinch', CODE_HOLD + 0.1, t) // wrong
    expect(code.progress).toBe(0)
    const [, done] = hold(code, 'two', CODE_HOLD + 0.1, t) // out of order: still nothing
    expect(done).toBe(false)
    expect(code.progress).toBe(0)
    expect(perform(code, t + 1)[1]).toBe(true) // and it works from scratch
  })

  it('a wrong pose that is the first pose of the code counts as step 1 straight away', () => {
    const code = new GestureCode()
    let t = 0
    ;[t] = hold(code, 'fist', CODE_HOLD + 0.1, t)
    ;[t] = hold(code, 'open', CODE_HOLD + 0.1, t) // oops
    ;[t] = hold(code, 'fist', CODE_HOLD + 0.1, t) // restart
    expect(code.progress).toBe(1)
    ;[t] = hold(code, 'point', CODE_HOLD + 0.1, t)
    ;[t] = hold(code, 'two', CODE_HOLD + 0.1, t)
    const [, done] = hold(code, 'open', CODE_HOLD + 0.1, t)
    expect(done).toBe(true)
  })

  it('too slow: the code has to be finished within CODE_TOTAL seconds', () => {
    const code = new GestureCode()
    let t = 0
    ;[t] = hold(code, 'fist', CODE_HOLD + 0.1, t)
    ;[t] = hold(code, null, CODE_TOTAL, t) // dawdling…
    expect(code.progress).toBe(0)
    ;[t] = hold(code, 'point', CODE_HOLD + 0.1, t)
    ;[t] = hold(code, 'two', CODE_HOLD + 0.1, t)
    const [, done] = hold(code, 'open', CODE_HOLD + 0.1, t)
    expect(done).toBe(false)
  })

  it('a quick but valid performance (a second or two) works', () => {
    const code = new GestureCode()
    expect(perform(code, 0, CODE_HOLD + 0.05)[1]).toBe(true)
  })

  it('holding the last pose does not complete it twice; repeating the code completes it again (toggle)', () => {
    const code = new GestureCode()
    let t = 0
    let count = 0
    let d: boolean
    ;[t, d] = perform(code, t)
    if (d) count++
    ;[t, d] = hold(code, 'open', 3, t) // keep holding the open palm
    if (d) count++
    expect(count).toBe(1)
    ;[t] = hold(code, null, 0.5, t)
    ;[t, d] = perform(code, t)
    if (d) count++
    expect(count).toBe(2)
  })

  it('normal play does not trigger it: poses in another order, or a lone pose held for a long time', () => {
    const code = new GestureCode()
    let t = 0
    let done = false
    for (const pose of [
      'open',
      'fist',
      'open',
      'fist',
      'point',
      'point',
      'fist',
      'two',
      'open',
      'pinch',
      'open',
    ] as const) {
      let d: boolean
      ;[t, d] = hold(code, pose, 0.6, t)
      done ||= d
    }
    expect(done).toBe(false)
    expect(hold(code, 'fist', 20, t)[1]).toBe(false)
  })

  it('reset() forgets the progress', () => {
    const code = new GestureCode()
    hold(code, 'fist', CODE_HOLD + 0.1, 0)
    expect(code.progress).toBe(1)
    code.reset()
    expect(code.progress).toBe(0)
  })
})
