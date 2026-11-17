import type { Pose } from './gestures'

/**
 * The "gesture code": a short sequence of poses that, performed in order, toggles avatar mode on / off.
 * Count up with your fingers: fist (0) → point (1) → two fingers (2) → open palm (5).
 */
export const GESTURE_CODE: readonly Pose[] = ['fist', 'point', 'two', 'open']
/** each pose has to be held this long (seconds) before it counts as a step */
export const CODE_HOLD = 0.25
/** the whole code has to be finished within this long (seconds) of its first step */
export const CODE_TOTAL = 6

/**
 * Watches the primary hand's (already debounced) pose over time and tells you when the code was just completed.
 *  - a step counts when the *next* pose of the code has been held for `CODE_HOLD`;
 *  - the hand dropping out of view ('none' / no hand) does not break the code — only the clock does (`CODE_TOTAL`);
 *  - a different pose held for `CODE_HOLD` is a mistake: the code starts again (and if that pose is the first one of
 *    the code, it already counts as step 1, so "fist, oops, fist, point, two, open" still works);
 *  - repeating the code works again and again (it is a toggle).
 */
export class GestureCode {
  private step = 0
  private startedAt = 0
  private current: Pose = 'none'
  private since = 0
  private settled = false

  /** how many steps of the code have been confirmed so far (0 … code length − 1) */
  get progress(): number {
    return this.step
  }

  get length(): number {
    return GESTURE_CODE.length
  }

  reset() {
    this.step = 0
    this.settled = false
    this.current = 'none'
  }

  /**
   * @param pose the primary hand's debounced pose, or null / 'none' when there is no hand
   * @param t time in seconds (monotonic)
   * @returns true exactly once, on the frame the code is completed
   */
  update(pose: Pose | null | undefined, t: number): boolean {
    const p: Pose = pose ?? 'none'
    if (p !== this.current) {
      this.current = p
      this.since = t
      this.settled = false
    }
    if (this.step > 0 && t - this.startedAt > CODE_TOTAL) this.step = 0 // too slow: start over

    if (this.settled || p === 'none' || t - this.since < CODE_HOLD) return false
    this.settled = true // handle each held pose once

    if (p === GESTURE_CODE[this.step]) {
      if (this.step === 0) this.startedAt = t
      this.step++
      if (this.step === GESTURE_CODE.length) {
        this.step = 0
        return true
      }
      return false
    }
    // a wrong pose, held long enough: start again (it may itself be the first step)
    this.step = 0
    if (p === GESTURE_CODE[0]) {
      this.startedAt = t
      this.step = 1
    }
    return false
  }
}
