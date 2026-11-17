import { OneEuro } from './oneEuro'
import type { Pt } from './gestures'

/**
 * The hand "avatar": the tracked hand drawn as a small, constant-size character. The raw tracking jitters by a few
 * pixels every frame — fine for gestures, ugly for a character — so everything shown is heavily smoothed here.
 */
export const AVATAR = {
  /** wrist → middle-knuckle length on screen, px (the whole hand is ≈ 2.5× this tall); the avatar is this size whatever the hand's distance from the camera */
  handPx: 16,
  /** palm position (One Euro, frame-height units): a low cutoff keeps it steady when still, beta lets fast moves through */
  posMinCutoff: 0.5,
  posBeta: 3,
  posDCutoff: 1.5,
  /** each joint's hand-local coordinates (hand-size units): the fingers may move, but not shake */
  jointMinCutoff: 0.8,
  jointBeta: 1.2,
  jointDCutoff: 1.5,
  /** hand size is smoothed per frame (0..1, higher = faster), so a hand coming closer doesn't make the avatar swell */
  sizeSmoothing: 0.3,
  /** the position only moves when the smoothed value is further than this from where it is drawn (frame heights) */
  deadBand: 0.0012,
  /** the hand has been gone this long (s) → the avatar disappears (a one-frame dropout must not blink it) */
  lostAfter: 0.35,
}

const WRIST = 0
const MIDDLE_MCP = 9
const PALM_IDS = [0, 5, 9, 13, 17]

export interface AvatarPose {
  /** palm centre, 0..1 of the frame, mirrored like a mirror (x grows to the right on screen) */
  x: number
  y: number
  /** the 21 landmarks relative to the palm centre, mirrored, in hand-size units (wrist → middle knuckle = 1) */
  local: { x: number; y: number }[]
}

/** Raw landmarks → palm-relative, mirrored, size-normalised coordinates. `size` is wrist→middle knuckle (frame heights). */
function toLocal(lm: Pt[], cx: number, cy: number, aspect: number, size: number) {
  const s = Math.max(size, 1e-6)
  return lm.map((p) => ({ x: (-(p.x - cx) * aspect) / s, y: (p.y - cy) / s }))
}

/** A flat open hand (fingers up, thumb on the left), wrist at the origin, wrist→middle knuckle ≈ 0.15. */
export function openHandRaw(): Pt[] {
  const lm: Pt[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }))
  const cols = [-0.04, -0.013, 0.013, 0.04] // index … pinky knuckle x
  ;[5, 9, 13, 17].forEach((mcp, f) => {
    const x = cols[f]!
    // the fingers fan out a little towards the tips, so the small canned hand reads as a hand
    lm[mcp] = { x, y: -0.15 }
    lm[mcp + 1] = { x: x * 1.25, y: -0.25 }
    lm[mcp + 2] = { x: x * 1.5, y: -0.31 }
    lm[mcp + 3] = { x: x * 1.75, y: -0.38 }
  })
  lm[1] = { x: -0.05, y: -0.04 }
  lm[2] = { x: -0.08, y: -0.08 }
  lm[3] = { x: -0.13, y: -0.12 }
  lm[4] = { x: -0.2, y: -0.16 }
  return lm
}

/** The canned avatar for the mouse fallback: an open hand, in the same units as `AvatarPose.local`. */
export const OPEN_HAND_LOCAL: readonly { x: number; y: number }[] = (() => {
  const lm = openHandRaw()
  const cx = PALM_IDS.reduce((a, id) => a + lm[id]!.x, 0) / PALM_IDS.length
  const cy = PALM_IDS.reduce((a, id) => a + lm[id]!.y, 0) / PALM_IDS.length
  const size = Math.hypot(lm[WRIST]!.x - lm[MIDDLE_MCP]!.x, lm[WRIST]!.y - lm[MIDDLE_MCP]!.y)
  return toLocal(lm, cx, cy, 1, size)
})()

/**
 * Smooths a tracked hand into a steady, constant-size avatar. Call `update` every detection frame; call `reset`
 * when the hand is lost or changes (so it isn't smoothed across a gap).
 */
export class AvatarSmoother {
  private fx = new OneEuro(AVATAR.posMinCutoff, AVATAR.posBeta, AVATAR.posDCutoff)
  private fy = new OneEuro(AVATAR.posMinCutoff, AVATAR.posBeta, AVATAR.posDCutoff)
  private joints: { x: OneEuro; y: OneEuro }[] = []
  private size: number | null = null
  private shown: { x: number; y: number } | null = null

  reset() {
    this.fx = new OneEuro(AVATAR.posMinCutoff, AVATAR.posBeta, AVATAR.posDCutoff)
    this.fy = new OneEuro(AVATAR.posMinCutoff, AVATAR.posBeta, AVATAR.posDCutoff)
    this.joints = []
    this.size = null
    this.shown = null
  }

  /** Steady position: One Euro, then a small dead-band so micro-wobble doesn't move it at all. */
  private position(mx: number, my: number, aspect: number, t: number) {
    const x = this.fx.filter(mx, t)
    const y = this.fy.filter(my, t)
    if (!this.shown || Math.hypot((x - this.shown.x) * aspect, y - this.shown.y) >= AVATAR.deadBand)
      this.shown = { x, y }
    return this.shown
  }

  /** @param lm raw (unmirrored) landmarks of ONE hand @param aspect frame width / height @param t seconds */
  update(lm: Pt[], aspect: number, t: number): AvatarPose {
    const cx = PALM_IDS.reduce((a, id) => a + lm[id]!.x, 0) / PALM_IDS.length
    const cy = PALM_IDS.reduce((a, id) => a + lm[id]!.y, 0) / PALM_IDS.length
    const rawSize = Math.hypot(
      (lm[WRIST]!.x - lm[MIDDLE_MCP]!.x) * aspect,
      lm[WRIST]!.y - lm[MIDDLE_MCP]!.y,
    )
    this.size =
      this.size === null ? rawSize : this.size + (rawSize - this.size) * AVATAR.sizeSmoothing
    const pos = this.position(1 - cx, cy, aspect, t)
    const raw = toLocal(lm, cx, cy, aspect, this.size)
    if (this.joints.length !== raw.length)
      this.joints = raw.map(() => ({
        x: new OneEuro(AVATAR.jointMinCutoff, AVATAR.jointBeta, AVATAR.jointDCutoff),
        y: new OneEuro(AVATAR.jointMinCutoff, AVATAR.jointBeta, AVATAR.jointDCutoff),
      }))
    const local = raw.map((p, i) => ({
      x: this.joints[i]!.x.filter(p.x, t),
      y: this.joints[i]!.y.filter(p.y, t),
    }))
    return { x: pos.x, y: pos.y, local }
  }

  /** Mouse fallback: the pointer (0..1 of the canvas) is the hand; the avatar is the canned open hand. */
  updateFromPoint(x: number, y: number, aspect: number, t: number): AvatarPose {
    const pos = this.position(x, y, aspect, t)
    return { x: pos.x, y: pos.y, local: OPEN_HAND_LOCAL.map((p) => ({ ...p })) }
  }
}
