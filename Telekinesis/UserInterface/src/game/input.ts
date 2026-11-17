import type { HandSignals } from '@/helpers/gestures'
import type { SwarmInput } from './swarm'

/** The controlling hand: the first detected one (right hand preferred when both are up). */
export function primaryHand(signals: HandSignals[]): HandSignals | undefined {
  return signals.find((h) => h.side === 'right') ?? signals[0]
}

const NO_DIR = { x: 0, y: 0 }
const ABSENT: SwarmInput = {
  present: false,
  pose: 'none',
  dir: NO_DIR,
  pinch: 0,
  drift: NO_DIR,
  reach: 0.5,
  stop: false,
}

/**
 * How close the hand is to the camera, 0..1, from its size on screen (wrist → middle knuckle as a fraction of the
 * frame height: ≈0.10 at about a metre, ≈0.20 at arm's length from a laptop, ≈0.30 when very close).
 */
export const REACH_FAR_SIZE = 0.1
export const REACH_NEAR_SIZE = 0.3
export function handReach(size: number): number {
  if (!Number.isFinite(size)) return 0.5
  return Math.min(1, Math.max(0, (size - REACH_FAR_SIZE) / (REACH_NEAR_SIZE - REACH_FAR_SIZE)))
}

/** Camera hand → swarm input. The hand's position is intentionally ignored. */
export function handToSwarmInput(hand: HandSignals | undefined, stop = false): SwarmInput {
  if (!hand) return ABSENT
  return {
    present: true,
    pose: hand.pose,
    dir: hand.pose === 'point' ? hand.pointDir : NO_DIR,
    pinch: hand.pinching ? hand.pinchAmount : 0,
    drift: hand.pose === 'open' ? hand.velocity : NO_DIR,
    reach: handReach(hand.size),
    stop,
  }
}

/**
 * The stop gesture: BOTH hands open at the same time (an open palm in each hand; a back-facing fist counts as open).
 * It has to be held for `HOLD` seconds before it counts (so a second hand drifting into view by accident doesn't stop
 * the swarm) and it lets go `GRACE` seconds after either hand leaves the pose (so a tracking flicker doesn't release it).
 */
export const STOP_HOLD = 0.3
export const STOP_GRACE = 0.15
export class StopDetector {
  private since = -1
  private lastBoth = -1
  private on = false

  /** @param t time in seconds (monotonic) */
  update(signals: HandSignals[], t: number): boolean {
    const both = signals.length >= 2 && signals.every((h) => h.pose === 'open')
    if (both) {
      if (this.since < 0) this.since = t
      this.lastBoth = t
      if (t - this.since >= STOP_HOLD) this.on = true
    } else {
      this.since = -1
      if (this.on && t - this.lastBoth > STOP_GRACE) this.on = false
    }
    return this.on
  }
}

/**
 * Mouse fallback (no camera needed). Hold the button = open palm (levitate), + Shift = two fingers (circle),
 * + arrow keys / WASD = point that way (move), + Alt = pinch (clump), + Space = both hands open (stop). Moving the
 * mouse while holding = moving the open hand (drift); the wheel = how close the hand is. Released = fist (drop).
 */
export function mouseToSwarmInput(
  down: boolean,
  shift: boolean,
  alt: boolean,
  dir: { x: number; y: number },
  /** pointer velocity in frame-heights per second (stands in for the open hand's motion) */
  drift: { x: number; y: number } = NO_DIR,
  /** 0..1 stands in for how close the hand is (mouse wheel) */
  reach = 0.5,
  /** Space held */
  stop = false,
): SwarmInput {
  if (!down)
    return { present: true, pose: 'fist', dir: NO_DIR, pinch: 0, drift: NO_DIR, reach, stop: false }
  const pinch = alt ? 1 : 0
  if (stop)
    return { present: true, pose: 'open', dir: NO_DIR, pinch, drift: NO_DIR, reach, stop: true }
  if (dir.x !== 0 || dir.y !== 0)
    return { present: true, pose: 'point', dir, pinch, drift: NO_DIR, reach, stop: false }
  if (shift)
    return { present: true, pose: 'two', dir: NO_DIR, pinch, drift: NO_DIR, reach, stop: false }
  return { present: true, pose: 'open', dir: NO_DIR, pinch, drift, reach, stop: false }
}
