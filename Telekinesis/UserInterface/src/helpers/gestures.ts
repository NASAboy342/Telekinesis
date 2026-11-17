import { OneEuro } from './oneEuro'

/** Minimal landmark shape (MediaPipe's NormalizedLandmark satisfies it). */
export interface Pt {
  x: number
  y: number
  /** depth relative to the wrist (MediaPipe: smaller = closer to the camera); optional */
  z?: number
}

export type Pose = 'none' | 'open' | 'fist' | 'point' | 'two' | 'pinch'
export type Side = 'left' | 'right'
/** Which side of the hand faces the camera: the palm, or the back of the hand. */
export type Facing = 'palm' | 'back'

export interface FacingInfo {
  state: Facing
  /** smoothed, -1 = back of the hand to the camera … +1 = palm to the camera */
  score: number
  /** the two cues, each -1..1 with the same sign convention (for tuning / the spike readout) */
  winding: number
  depth: number
}

export interface HandSignals {
  side: Side
  /** Debounced pose. */
  pose: Pose
  /** Thumb–index closeness: 0 = far apart, 1 = touching. */
  pinchAmount: number
  pinching: boolean
  /** Fraction of the four fingers that are extended (0 = fist … 1 = open palm). */
  openness: number
  /** [thumb, index, middle, ring, pinky] */
  extended: boolean[]
  /** Smoothed palm centre, screen space (mirrored like a mirror), 0..1. */
  palm: { x: number; y: number }
  /** Hand size on screen (wrist→middle knuckle), as a fraction of the frame height. Proxy for distance to the camera. */
  size: number
  /** Palm or back of the hand toward the camera (see `computeFacing`). */
  facing: FacingInfo
  /** Unit vector the index finger points along, in mirrored screen space (x right, y down). Meaningful when `pose` is 'point'. */
  pointDir: { x: number; y: number }
  /** Smoothed palm velocity in frame-heights per second. */
  velocity: { x: number; y: number }
  speed: number
}

// MediaPipe hand landmark indices
const WRIST = 0
const THUMB_IP = 3
const THUMB_TIP = 4
const INDEX_MCP = 5
const INDEX_TIP = 8
const MIDDLE_MCP = 9
const PINKY_MCP = 17
const PALM_IDS = [0, 5, 9, 13, 17]
/** [pip, tip] of index, middle, ring, pinky */
const FINGERS: ReadonlyArray<readonly [number, number]> = [
  [6, 8],
  [10, 12],
  [14, 16],
  [18, 20],
]

export const THRESHOLDS = {
  /** tip distance from wrist / pip distance from wrist above this → finger extended */
  extendedRatio: 1.15,
  pinchOn: 0.3,
  pinchOff: 0.45,
  /** index tip must be this much farther from the wrist than the index knuckle for a pinch */
  pinchIndexOut: 1.15,
  /** frames a new pose must hold before it is reported */
  poseFrames: 3,
  /** facing: weights of the two cues, smoothing per frame, and the dead zone around 0 where the previous answer is kept */
  facingWindingWeight: 0.6,
  facingDepthWeight: 0.4,
  facingSmoothing: 0.2,
  facingDeadZone: 0.15,
}

/**
 * All geometry is distance-based (never "y is above"), so the result does not depend on how the hand or the
 * camera is rotated. `aspect` = frame width / height, to undo the non-square normalized coordinates.
 */
export function createDistance(aspect: number) {
  return (a: Pt, b: Pt) => Math.hypot((a.x - b.x) * aspect, a.y - b.y)
}

interface HandState {
  fx: OneEuro
  fy: OneEuro
  prev: { x: number; y: number; t: number } | null
  vx: number
  vy: number
  dirX: number
  dirY: number
  facingScore: number
  facing: Facing
  facingInit: boolean
  pinching: boolean
  pose: Pose
  candidate: Pose
  candidateFrames: number
}

function newState(): HandState {
  return {
    fx: new OneEuro(),
    fy: new OneEuro(),
    prev: null,
    vx: 0,
    vy: 0,
    dirX: 0,
    dirY: 0,
    facingScore: 0.5,
    facing: 'palm',
    facingInit: false,
    pinching: false,
    pose: 'none',
    candidate: 'none',
    candidateFrames: 0,
  }
}

export function fingerStates(lm: Pt[], dist: (a: Pt, b: Pt) => number): boolean[] {
  const wrist = lm[WRIST]!
  const thumb = dist(lm[THUMB_TIP]!, lm[PINKY_MCP]!) > dist(lm[THUMB_IP]!, lm[PINKY_MCP]!) * 1.1
  const rest = FINGERS.map(
    ([pip, tip]) => dist(lm[tip]!, wrist) > dist(lm[pip]!, wrist) * THRESHOLDS.extendedRatio,
  )
  return [thumb, ...rest]
}

export function classify(extended: boolean[], pinching: boolean, facing: Facing = 'palm'): Pose {
  if (pinching) return 'pinch'
  const [, index, middle, ring, pinky] = extended
  const count = [index, middle, ring, pinky].filter(Boolean).length
  if (count >= 3) return 'open'
  // a fist is only a fist with the palm side toward the camera; seen from the back it counts as an open palm
  if (count === 0) return facing === 'palm' ? 'fist' : 'open'
  if (index && count === 1) return 'point'
  if (index && middle && count === 2) return 'two' // index + middle out, ring + pinky curled
  return 'none'
}

const clamp1 = (v: number) => Math.min(1, Math.max(-1, v))
const TIPS = [8, 12, 16, 20]
const MCPS = [5, 9, 13, 17]

/**
 * Which side of the hand faces the camera. Two cues, both +1 = palm to the camera, -1 = back of the hand to it:
 *  - winding: the signed area of (wrist, index knuckle, pinky knuckle) in the raw (unmirrored) image flips when the
 *    hand is turned over; its sign for a given side of the hand depends on whether it is a left or a right hand
 *    (so it needs the label), and it fades to 0 when the hand is edge-on. The knuckles don't move when a fist is made,
 *    so this works for fists too.
 *  - depth: curled fingertips sit in front of the knuckles (closer to the camera) when the palm faces the camera
 *    and behind them when the back does. Only meaningful when the fingers are curled, so it is weighted by (1 − openness).
 * `label` is MediaPipe's 'Left' | 'Right' as reported for our unmirrored frames (= the user's own hand).
 */
export function facingCues(lm: Pt[], label: string, aspect: number, size: number) {
  const w = lm[WRIST]!
  const ax = (lm[INDEX_MCP]!.x - w.x) * aspect
  const ay = lm[INDEX_MCP]!.y - w.y
  const bx = (lm[PINKY_MCP]!.x - w.x) * aspect
  const by = lm[PINKY_MCP]!.y - w.y
  const cross = ax * by - ay * bx
  // derived for the unmirrored image: a right hand with the palm to the camera has cross < 0, a left hand cross > 0
  const sign = label === 'Right' ? -1 : 1
  const winding = clamp1((sign * cross) / Math.max(size * size * 0.25, 1e-9))
  let depth = 0
  if (lm[WRIST]!.z !== undefined) {
    const avg = (ids: number[]) => ids.reduce((a, id) => a + (lm[id]!.z ?? 0), 0) / ids.length
    depth = clamp1(-(avg(TIPS) - avg(MCPS)) / Math.max(size * 0.35, 1e-9))
  }
  return { winding, depth }
}

/** Turns raw landmarks into smoothed, debounced signals. One instance per game; tracks up to two hands by side. */
export class GestureTracker {
  private states = new Map<Side, HandState>()

  /**
   * @param hands landmarks per detected hand
   * @param labels MediaPipe handedness label per hand ('Left' | 'Right'), used as-is
   * @param aspect frame width / height
   * @param t time in seconds
   */
  update(hands: Pt[][], labels: string[], aspect: number, t: number): HandSignals[] {
    const dist = createDistance(aspect)
    const out: HandSignals[] = []
    const seen = new Set<Side>()
    hands.forEach((lm, i) => {
      // Verified on a real webcam in the macOS window: with our unmirrored frames the model's label is already
      // the user's own hand (their right hand reports 'Right').
      const side: Side = labels[i] === 'Right' ? 'right' : 'left'
      if (seen.has(side)) return // two hands claiming one label: keep the first
      seen.add(side)
      let s = this.states.get(side)
      if (!s) this.states.set(side, (s = newState()))
      out.push(this.analyze(lm, side, labels[i] ?? '', s, dist, aspect, t))
    })
    for (const side of this.states.keys()) if (!seen.has(side)) this.states.delete(side)
    return out
  }

  private analyze(
    lm: Pt[],
    side: Side,
    label: string,
    s: HandState,
    dist: (a: Pt, b: Pt) => number,
    aspect: number,
    t: number,
  ): HandSignals {
    const size = dist(lm[WRIST]!, lm[MIDDLE_MCP]!)
    const extended = fingerStates(lm, dist)
    const pinchRatio = dist(lm[THUMB_TIP]!, lm[INDEX_TIP]!) / Math.max(size, 1e-6)
    // A fist also brings the thumb next to the index tip: a pinch needs the index finger NOT curled onto the palm.
    const indexOut =
      dist(lm[INDEX_TIP]!, lm[WRIST]!) > dist(lm[INDEX_MCP]!, lm[WRIST]!) * THRESHOLDS.pinchIndexOut
    s.pinching =
      indexOut && (s.pinching ? pinchRatio < THRESHOLDS.pinchOff : pinchRatio < THRESHOLDS.pinchOn)
    const pinchAmount = Math.min(1, Math.max(0, 1 - (pinchRatio - THRESHOLDS.pinchOn * 0.5) / 0.8))

    // palm or back of the hand toward the camera
    const openness = [extended[1], extended[2], extended[3], extended[4]].filter(Boolean).length / 4
    const cues = facingCues(lm, label, aspect, size)
    const depthW = THRESHOLDS.facingDepthWeight * (1 - openness)
    const rawFacing = clamp1(
      (THRESHOLDS.facingWindingWeight * cues.winding + depthW * cues.depth) /
        (THRESHOLDS.facingWindingWeight + depthW),
    )
    // first frame of a hand: take the reading as it is (don't start from a made-up default); then smooth
    if (!s.facingInit) {
      s.facingInit = true
      s.facingScore = rawFacing
    } else s.facingScore += (rawFacing - s.facingScore) * THRESHOLDS.facingSmoothing
    if (s.facingScore > THRESHOLDS.facingDeadZone) s.facing = 'palm'
    else if (s.facingScore < -THRESHOLDS.facingDeadZone) s.facing = 'back'

    const raw = classify(extended, s.pinching, s.facing)
    if (raw === s.candidate) s.candidateFrames++
    else {
      s.candidate = raw
      s.candidateFrames = 1
    }
    if (s.candidateFrames >= THRESHOLDS.poseFrames) s.pose = s.candidate

    const cx = PALM_IDS.reduce((a, id) => a + lm[id]!.x, 0) / PALM_IDS.length
    const cy = PALM_IDS.reduce((a, id) => a + lm[id]!.y, 0) / PALM_IDS.length
    const x = s.fx.filter(1 - cx, t) // mirrored
    const y = s.fy.filter(cy, t)
    if (s.prev) {
      const dt = Math.max(t - s.prev.t, 1e-3)
      const k = 0.5
      s.vx = k * (((x - s.prev.x) * aspect) / dt) + (1 - k) * s.vx
      s.vy = k * ((y - s.prev.y) / dt) + (1 - k) * s.vy
    }
    s.prev = { x, y, t }

    // index finger direction (knuckle → tip), mirrored like the picture, lightly smoothed
    const rx = -(lm[INDEX_TIP]!.x - lm[INDEX_MCP]!.x) * aspect
    const ry = lm[INDEX_TIP]!.y - lm[INDEX_MCP]!.y
    const rl = Math.hypot(rx, ry)
    if (rl > 1e-6) {
      const k = 0.35
      s.dirX += k * (rx / rl - s.dirX)
      s.dirY += k * (ry / rl - s.dirY)
      const l = Math.hypot(s.dirX, s.dirY) || 1
      s.dirX /= l
      s.dirY /= l
    }

    return {
      side,
      facing: { state: s.facing, score: s.facingScore, winding: cues.winding, depth: cues.depth },
      pose: s.pose,
      pointDir: { x: s.dirX, y: s.dirY },
      pinchAmount,
      pinching: s.pinching,
      openness: [extended[1], extended[2], extended[3], extended[4]].filter(Boolean).length / 4,
      extended,
      palm: { x, y },
      size,
      velocity: { x: s.vx, y: s.vy },
      speed: Math.hypot(s.vx, s.vy),
    }
  }
}
