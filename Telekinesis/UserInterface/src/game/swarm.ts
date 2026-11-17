import type { Pose } from '@/helpers/gestures'

/**
 * What the swarm needs from the controlling hand. Deliberately no position: the hand chooses the *behaviour*
 * (pose), a direction while pointing, and how tight the swarm is (pinch). It never places the balls.
 */
export interface SwarmInput {
  present: boolean
  pose: Pose
  /** unit vector (screen space, y down) the finger points along; only used with the 'point' pose */
  dir: { x: number; y: number }
  /** 0..1 — how tightly thumb and index are pinched (0 when not pinching) */
  pinch: number
  /**
   * how the open hand is moving, in frame-heights per second, mirrored screen space (x right, y down).
   * Only used with an open palm: a gentle drift of a random, changing subset of the balls that way.
   */
  drift: { x: number; y: number }
  /** 0..1 — how close the hand is to the camera (0 far … 1 close); scales how strongly the drift acts */
  reach: number
  /** the stop gesture (both hands open): brake the swarm to a standstill, then it just keeps floating there */
  stop: boolean
  /**
   * Avatar mode only: world position of the avatar hand. While the swarm is circling (mode 'circle') it circles
   * around THIS point, which follows the avatar, instead of around its own middle / front ball.
   */
  follow?: { x: number; y: number } | null
}

export type SwarmMode = 'rest' | 'levitate' | 'circle' | 'move'

export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  /** 0 = pulled by gravity, 1 = floating (gravity off, air drag on) */
  lev: number
  /** per-ball constants for the gentle floating wander */
  phase: number
  wander: number
  /** 0..1 — how much the pointing "stream" has caught this ball (head first, then back along the swarm) */
  e: number
  /** seconds after the stream starts that it reaches this ball (set when pointing starts / turns sharply) */
  tau: number
  /** this ball's own orbit-spring strength (a factor around 1), used when circling a followed point (see `followBindSpread`) */
  bind: number
}

/**
 * Everything is forces on velocity (no ball is ever pinned to a target point):
 *  - open palm = gravity off. Nothing else: balls keep their velocity and only the air drag slows them;
 *  - pinch pulls the balls together toward a centre point; circle swirls them around the same centre;
 *  - that centre is the swarm's middle, or — if the swarm is moving when you pinch / circle — the front ball,
 *    which keeps coasting with its own velocity;
 *  - pointing pushes the balls along the finger as a stream (head first), turning the swarm into a comet.
 */
export const TUNING = {
  count: 60,
  /**
   * The world is measured in its own units, independent of the window: a ball is 10 units across its radius,
   * the swarm's cloud ~17 balls across. The view draws the world scaled down (see game/config.ts), so a bigger
   * world just means smaller balls and more room — the physics feel never depends on the window size.
   */
  ballRadius: 10,
  cloud: 175,
  /** empty strip under the floor line */
  floorMargin: 110,
  gravity: 4500,
  restitution: 0.45,
  floorFriction: 0.88,
  /** air drag (1/s) of a floating ball; resting balls only feel a trace */
  airDrag: 0.6,
  /**
   * the pointing push and the hand drift were tuned as (terminal speed × this drag): keeping them tied to a fixed
   * reference means changing `airDrag` only changes how long things coast, not how hard the gestures push
   */
  pushRefDrag: 1.2,
  restDrag: 0.05,
  maxDt: 1 / 30,
  /** gravity fades in/out this fast (1/s) */
  liftRate: 30,
  /** open palm from the floor: every ball gets a small random upward kick (units/s) so you can see it "woke up" */
  kickUp: [90, 290] as readonly [number, number],
  kickSide: 90,
  /** pointing push, expressed as the terminal speed it would reach with `pushRefDrag` (world units per second) */
  moveSpeed: 1200,
  /**
   * speed control: while pointing, the hand's distance scales the push — a far hand moves the swarm slowly
   * (`speedGainFar`×), a close hand quickly (`speedGainNear`×); a hand at a comfortable middle distance (reach 0.5) is 1×.
   * The reach is eased (`reachEase`, 1/s) so moving the hand nearer / further speeds up / slows down smoothly.
   */
  speedGainFar: 0.4,
  speedGainNear: 1.6,
  reachEase: 4,
  /**
   * …and it sets the top speed the pointing can build up to (units/s): a far hand 1500, middle 3500, close 6000.
   * Balls the stream carries that go faster feel an extra drag (`overspeedDrag`, 1/s per unit of excess ratio);
   * balls it has let go of are not capped, so an open palm still just coasts.
   */
  speedCapFar: 1500,
  speedCapNear: 6000,
  overspeedDrag: 3,
  /** keeps stream-caught balls from straying: cohesion beyond the cloud radius (1/s²), capped so far-flung stragglers aren't slingshotted */
  cohesion: 25,
  cohesionMax: 6000,
  /** pinch pulls the balls to the centre: stiffness (1/s²) and damping relative to the centre's velocity (1/s) */
  pinchPull: 9,
  pinchDamp: 6,
  /** circling: inward binding (1/s²) and sideways push (units/s²) around the centre */
  orbitBinding: 6,
  /** …capped, so a ball thousands of units away isn't slingshotted through the centre (units/s²) */
  orbitBindingMax: 5000,
  swirl: 330,
  /**
   * circling around a point that follows the avatar: the point's velocity is smoothed per frame (0..1), and the radial
   * part of the balls' motion relative to it is damped (1/s) so they settle into a ring around the moving hand
   * instead of oscillating through it
   */
  followVelSmooth: 0.25,
  /** …and capped (units/s), so a followed point that jumps (a hand re-appearing elsewhere) can't kick the balls */
  followVMax: 3000,
  /**
   * circling a followed point: each ball gets its own spring strength, `1 ± followBindSpread/2` times the orbit binding
   * (from the ball's index, no randomness). A pure spring has the same orbit period at every radius, so a swarm that
   * flies in as one clump would orbit as one clump for ever; different periods shear it into a ring around the hand.
   */
  followBindSpread: 1.5,
  followDamp: 3.5,
  /** orbit spin ramps in/out (1/s) */
  spinRamp: 2.5,
  /** the swarm counts as "moving" (centre = front ball) above this speed (units/s) */
  movingSpeed: 200,
  /** the pointing stream reaches the whole swarm head-to-tail in this many seconds (+ a little more for balls far off the line) */
  streamReachTime: 0.55,
  streamSideTime: 0.25,
  /** engagement rise / fall rates (1/s) */
  streamRise: 8,
  streamFall: 2,
  /** while caught by the stream: sideways-velocity damping (1/s) and pull toward the line (1/s²) */
  streamAlign: 5,
  streamPull: 8,
  /**
   * comet shape: balls at the head get a stronger push (so the swarm stretches) and a stronger pull onto the line
   * (a narrow tip, a looser tail); the swarm may elongate along the line up to (1 + streamStretch)× the cloud radius
   */
  streamHeadBias: 0.8,
  streamStretch: 3,
  /** "faster and faster": the push grows with how long you keep pointing, convexly, from boostBase× up to boostMax× after boostTime seconds */
  boostBase: 0.7,
  boostMax: 2.2,
  /** while you keep pointing the air drag on caught balls eases off by up to this fraction, so speed keeps climbing */
  streamDragCut: 0.85,
  boostTime: 3.2,
  /**
   * open palm + a moving hand: a slow drift of random balls in the hand's direction.
   * terminal speed of an affected ball (units/s), hand speed (frame-heights/s) below which nothing happens (jitter)
   * and at which the drift is at full strength
   */
  driftSpeed: 300,
  driftDeadZone: 0.25,
  driftFull: 1.0,
  /**
   * the closer the hand, the more it affects: a ball is "picked" while its private gust (a slow random sine) is above
   * a threshold that goes from `driftPickFar` (few balls, far hand) to `driftPickNear` (most balls, close hand), the pick
   * fades in over `driftSoft`; picked balls' terminal speed is scaled from `driftGainFar`× to `driftGainNear`×.
   * A hand at a comfortable middle distance (reach 0.5) behaves like the plain numbers above.
   */
  driftPickFar: 0.5,
  driftPickNear: -0.7,
  driftSoft: 0.5,
  driftGainFar: 0.3,
  driftGainNear: 1.7,
  /** stop gesture: how hard the extra drag is (1/s, so ≈ 0.5 s to a standstill) and how fast it eases in / out (1/s) */
  stopDrag: 6,
  stopEase: 10,
  /** a turn sharper than this restarts the stream's spreading (radians) */
  streamTurn: (50 * Math.PI) / 180,
  /** gentle floating wander (units/s²) */
  wanderAccel: 20,
}

/** A point the pinch pull / circling work around. It coasts with the air drag like a ball would. */
interface Anchor {
  x: number
  y: number
  vx: number
  vy: number
}

export class Swarm {
  balls: Ball[] = []
  mode: SwarmMode = 'rest'
  /** how strongly the stop gesture is braking right now, 0..1 (for the HUD) */
  get braking(): number {
    return this.brake
  }
  /** centre of the current pinch / circle (null when neither is happening) */
  anchor: Anchor | null = null
  /** the followed (avatar) point last frame and its smoothed velocity, for the kinematic centre */
  private followPrev: { x: number; y: number } | null = null
  private followV = { x: 0, y: 0 }
  /** true while the centre is the followed avatar point */
  private following = false
  /** eased pinch strength 0..1 */
  private pinchE = 0
  /** eased orbit strength 0..1 */
  private spin = 0
  /** eased hand distance 0..1 (see `reachEase`) */
  private reachE = 0.5
  /** eased stop-gesture strength 0..1 */
  private brake = 0
  /** the pointing stream: an invisible line growing from the swarm's average point along the finger */
  private stream = { active: false, t: 0, charge: 0, dir: { x: 1, y: 0 }, ref: { x: 1, y: 0 } }
  private time = 0
  private rng: () => number

  constructor(
    public width: number,
    public height: number,
    count = TUNING.count,
    seed = 1,
  ) {
    // small deterministic PRNG so tests are repeatable
    let s = seed >>> 0
    this.rng = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
    // start as a loose heap in the middle of the floor
    for (let i = 0; i < count; i++) {
      this.balls.push({
        x: width / 2 + (this.rng() - 0.5) * this.cloud * 2.4,
        y: this.floorY - this.rng() * this.radius * 4,
        vx: 0,
        vy: 0,
        lev: 0,
        phase: this.rng() * Math.PI * 2 + i * 2.399963,
        wander: 0.6 + this.rng() * 0.8,
        e: 0,
        tau: 0,
        // golden-ratio sequence over the index: evenly spread values, no random numbers consumed
        bind: 1 - TUNING.followBindSpread / 2 + TUNING.followBindSpread * ((i * 0.6180339887) % 1),
      })
    }
  }

  get radius(): number {
    return TUNING.ballRadius
  }

  get cloud(): number {
    return TUNING.cloud
  }

  get floorY(): number {
    return this.height - TUNING.floorMargin - this.radius
  }

  /** The swarm's average point and average velocity. */
  centroid() {
    let x = 0
    let y = 0
    let vx = 0
    let vy = 0
    for (const b of this.balls) {
      x += b.x
      y += b.y
      vx += b.vx
      vy += b.vy
    }
    const n = Math.max(this.balls.length, 1)
    return { x: x / n, y: y / n, vx: vx / n, vy: vy / n }
  }

  resize(width: number, height: number) {
    this.width = width
    this.height = height
    for (const b of this.balls) {
      b.x = Math.min(Math.max(b.x, this.radius), width - this.radius)
      b.y = Math.min(b.y, this.floorY)
    }
  }

  /** Fraction of balls currently floating (gravity mostly off). */
  get hovering(): number {
    return this.balls.filter((b) => b.lev >= 0.5).length / Math.max(this.balls.length, 1)
  }

  /** The ball furthest ahead along `dir` (the head of a moving swarm). */
  private headBall(dir: { x: number; y: number }, c: { x: number; y: number }): Ball {
    let best = this.balls[0]!
    let bestA = -Infinity
    for (const b of this.balls) {
      const a = (b.x - c.x) * dir.x + (b.y - c.y) * dir.y
      if (a > bestA) {
        bestA = a
        best = b
      }
    }
    return best
  }

  /**
   * Where a pinch / circle gathers the swarm: the middle if it is (nearly) still; if it is moving, the front ball —
   * so the tail curls in around the head instead of the head being dragged back to the middle.
   */
  private makeAnchor(c: { x: number; y: number; vx: number; vy: number }): Anchor {
    const speed = Math.hypot(c.vx, c.vy)
    if (speed > TUNING.movingSpeed) {
      const head = this.headBall({ x: c.vx / speed, y: c.vy / speed }, c)
      return { x: head.x, y: head.y, vx: head.vx, vy: head.vy }
    }
    return { x: c.x, y: c.y, vx: c.vx, vy: c.vy }
  }

  /** Open palm / pointing from the floor: each ball gets a small random upward kick. */
  private kick() {
    const [lo, hi] = TUNING.kickUp
    for (const b of this.balls) {
      b.vy -= lo + this.rng() * (hi - lo)
      b.vx += (this.rng() - 0.5) * TUNING.kickSide
    }
  }

  step(dtRaw: number, input: SwarmInput) {
    const dt = Math.min(Math.max(dtRaw, 0), TUNING.maxDt)
    this.time += dt
    const T = TUNING

    // --- mode from the pose (other poses keep the current mode)
    const was = this.mode
    if (input.present) {
      if (input.pose === 'open') this.mode = 'levitate'
      else if (input.pose === 'two') this.mode = 'circle'
      else if (input.pose === 'point') this.mode = 'move'
      else if (input.pose === 'fist') this.mode = 'rest'
    }
    const lifting = this.mode !== 'rest'
    if (was === 'rest' && lifting) this.kick()
    const c = this.centroid()

    // --- pinch (eased) and the centre it / circling gather around
    const pinch = input.present ? Math.min(1, Math.max(0, input.pinch)) : 0
    this.pinchE += (pinch - this.pinchE) * Math.min(1, 8 * dt)
    const follow = input.present && this.mode === 'circle' ? (input.follow ?? null) : null
    if (follow) {
      // avatar mode: the centre IS the avatar (kinematic); its velocity comes from the avatar's own motion
      if (this.followPrev) {
        const k = T.followVelSmooth
        this.followV.x += ((follow.x - this.followPrev.x) / Math.max(dt, 1e-3) - this.followV.x) * k
        this.followV.y += ((follow.y - this.followPrev.y) / Math.max(dt, 1e-3) - this.followV.y) * k
        const m = Math.hypot(this.followV.x, this.followV.y)
        if (m > T.followVMax) {
          this.followV.x *= T.followVMax / m
          this.followV.y *= T.followVMax / m
        }
      } else this.followV = { x: 0, y: 0 }
      this.followPrev = { x: follow.x, y: follow.y }
      this.anchor = { x: follow.x, y: follow.y, vx: this.followV.x, vy: this.followV.y }
      this.following = true
    } else {
      this.followPrev = null
      this.following = false
      const needAnchor = this.mode === 'circle' || this.pinchE > 0.15
      if (needAnchor && !this.anchor) this.anchor = this.makeAnchor(c)
      else if (!needAnchor && this.pinchE < 0.05) this.anchor = null
    }
    this.brake +=
      ((input.present && input.stop ? 1 : 0) - this.brake) * Math.min(1, T.stopEase * dt)
    const a = this.anchor
    if (a && !this.following) {
      // the centre coasts like a ball: it keeps its velocity and the air drag slows it
      const ad = T.airDrag + T.stopDrag * this.brake
      a.vx -= ad * a.vx * dt
      a.vy -= ad * a.vy * dt
      a.x = Math.min(Math.max(a.x + a.vx * dt, this.radius), this.width - this.radius)
      a.y = Math.min(Math.max(a.y + a.vy * dt, this.radius), this.floorY)
    }
    this.spin += ((this.mode === 'circle' ? 1 : 0) - this.spin) * Math.min(1, T.spinRamp * dt)

    // --- the pointing stream: an invisible line grows from the swarm's average point along the finger
    const st = this.stream
    const len = Math.hypot(input.dir.x, input.dir.y)
    if (
      this.mode === 'move' &&
      input.present &&
      input.pose === 'point' &&
      len > 1e-6 &&
      Number.isFinite(len)
    ) {
      const nd = { x: input.dir.x / len, y: input.dir.y / len }
      if (!st.active) {
        st.active = true
        st.t = 0
        st.dir = nd
        st.ref = nd
        this.assignStreamOrder(st.dir, c)
      } else {
        const k = Math.min(1, 8 * dt)
        const sx = st.dir.x + (nd.x - st.dir.x) * k
        const sy = st.dir.y + (nd.y - st.dir.y) * k
        const sl = Math.hypot(sx, sy) || 1
        st.dir = { x: sx / sl, y: sy / sl }
        // a sharp turn restarts the spreading: the stream sweeps round, the new head goes first
        if (
          Math.acos(Math.min(1, Math.max(-1, nd.x * st.ref.x + nd.y * st.ref.y))) > T.streamTurn
        ) {
          st.ref = nd
          st.t = 0
          this.assignStreamOrder(st.dir, c)
        }
        st.t += dt
      }
      st.charge += dt
    } else {
      st.active = false
      st.charge = Math.max(0, st.charge - 1.5 * dt)
    }
    const dir = st.dir
    const sa = 1 + T.streamStretch // how far the swarm may elongate along the line
    // keeping the finger pointed makes the push grow faster and faster
    const q = Math.min(1, st.charge / T.boostTime) ** 2
    const boost = T.boostBase + (T.boostMax - T.boostBase) * q
    // speed control: the hand's distance (eased) scales the push
    const reachIn = Number.isFinite(input.reach) ? Math.min(1, Math.max(0, input.reach)) : 0.5
    this.reachE += (reachIn - this.reachE) * Math.min(1, T.reachEase * dt)
    const speedGain = T.speedGainFar + (T.speedGainNear - T.speedGainFar) * this.reachE
    const speedCap = T.speedCapFar + (T.speedCapNear - T.speedCapFar) * this.reachE
    const pushAccel = T.moveSpeed * T.pushRefDrag * boost * speedGain
    // head/tail position along the line, 0 = tail … 1 = head (live, so the head stays the head as the swarm stretches)
    let minA = Infinity
    let maxA = -Infinity
    for (const b of this.balls) {
      const al = (b.x - c.x) * dir.x + (b.y - c.y) * dir.y
      if (al < minA) minA = al
      if (al > maxA) maxA = al
    }
    const span = Math.max(maxA - minA, 1)
    const cloudR = this.cloud
    // hand motion with an open palm → slow drift: strength from the hand's speed (dead zone for jitter), direction from its motion
    const handSpeed = Math.hypot(input.drift.x, input.drift.y)
    const driftOn =
      input.present &&
      !input.stop && // both hands open = stop: waving them must not push anything
      input.pose === 'open' &&
      this.mode === 'levitate' &&
      Number.isFinite(handSpeed)
    const ds = (handSpeed - T.driftDeadZone) / (T.driftFull - T.driftDeadZone)
    const drift = driftOn ? Math.min(1, Math.max(0, ds)) : 0
    const driftDir =
      drift > 0 ? { x: input.drift.x / handSpeed, y: input.drift.y / handSpeed } : { x: 0, y: 0 }
    const reach = Number.isFinite(input.reach) ? Math.min(1, Math.max(0, input.reach)) : 0.5
    const driftAccel =
      T.driftSpeed * T.pushRefDrag * (T.driftGainFar + (T.driftGainNear - T.driftGainFar) * reach)
    const driftPickFrom = T.driftPickFar + (T.driftPickNear - T.driftPickFar) * reach

    for (const b of this.balls) {
      // gravity fades out / in quickly (open palm = gravity off)
      b.lev = lifting ? Math.min(1, b.lev + T.liftRate * dt) : Math.max(0, b.lev - 6 * dt)
      const lev = b.lev
      const dx = b.x - c.x
      const dy = b.y - c.y
      const along = dx * dir.x + dy * dir.y
      const across = -dx * dir.y + dy * dir.x
      const head = (along - minA) / span

      // stream engagement: the head goes first, then the stream reaches back along the swarm
      const target = st.active && st.t >= b.tau ? 1 : 0
      // (the stop gesture lets go of the stream at once, so nothing is left pushing against the brake)
      const eRate = target > b.e ? T.streamRise : T.streamFall * (1 + 10 * this.brake)
      b.e += (target - b.e) * Math.min(1, eRate * dt)

      let ax = 0
      let ay = T.gravity * (1 - lev)
      if (lev > 0) {
        // air drag — the only thing that slows a floating ball (a little less while a stream is carrying it)
        const drag = (T.restDrag + (T.airDrag - T.restDrag) * lev) * (1 - T.streamDragCut * q * b.e)
        const stopDrag = T.stopDrag * this.brake
        ax -= (drag + stopDrag) * b.vx
        ay -= (drag + stopDrag) * b.vy
        // balls the stream has reached are kept from straying too far from the swarm (a loose limit: the swarm may
        // stretch a long way along the stream, not sideways). Balls it hasn't reached yet feel nothing of this.
        if (b.e > 0.001) {
          const ex = along / sa
          const dEff = Math.max(Math.hypot(ex, across), 20)
          const pull = Math.min(T.cohesion * Math.max(0, dEff - cloudR), T.cohesionMax) * b.e
          const fa = (-pull * ex) / dEff
          const fn = (-pull * across) / dEff
          ax += (fa * dir.x - fn * dir.y) * lev
          ay += (fa * dir.y + fn * dir.x) * lev
        }
        // circle + pinch work around the anchor (the middle, or the front ball if the swarm was moving)
        if (a) {
          const rx = b.x - a.x
          const ry = b.y - a.y
          if (this.spin > 0.001) {
            const d = Math.max(Math.hypot(rx, ry), 20)
            const kBind = this.following ? T.orbitBinding * b.bind : T.orbitBinding
            let bx = -kBind * rx
            let by = -kBind * ry
            const bm = Math.hypot(bx, by)
            if (bm > T.orbitBindingMax) {
              bx *= T.orbitBindingMax / bm
              by *= T.orbitBindingMax / bm
            }
            ax += (bx - (ry / d) * T.swirl) * this.spin * lev
            ay += (by + (rx / d) * T.swirl) * this.spin * lev
            if (this.following) {
              // settle into a ring around the moving centre: damp the radial motion relative to it
              const vr = ((b.vx - a.vx) * rx + (b.vy - a.vy) * ry) / d
              ax -= T.followDamp * vr * (rx / d) * this.spin * lev
              ay -= T.followDamp * vr * (ry / d) * this.spin * lev
            }
          }
          if (this.pinchE > 0.001) {
            ax += (T.pinchPull * -rx + T.pinchDamp * (a.vx - b.vx)) * this.pinchE * lev
            ay += (T.pinchPull * -ry + T.pinchDamp * (a.vy - b.vy)) * this.pinchE * lev
          }
        }
        // caught by the stream: pushed along the line (the head harder), sideways velocity damped,
        // pulled onto the line (the head tighter) → teardrop, then a long thin comet
        if (b.e > 0.001) {
          const e = b.e * lev
          const push = pushAccel * (1 - T.streamHeadBias / 2 + T.streamHeadBias * head)
          ax += push * dir.x * e
          ay += push * dir.y * e
          const vAlong = b.vx * dir.x + b.vy * dir.y
          ax -= T.streamAlign * (b.vx - vAlong * dir.x) * e
          ay -= T.streamAlign * (b.vy - vAlong * dir.y) * e
          const pullLine = T.streamPull * (0.35 + 1.3 * head)
          ax -= pullLine * (dx - along * dir.x) * e
          ay -= pullLine * (dy - along * dir.y) * e
        }
        // the top speed the hand distance allows: balls the stream carries can't exceed it for long
        if (b.e > 0.001) {
          const sp = Math.hypot(b.vx, b.vy)
          if (sp > speedCap) {
            const k = (T.overspeedDrag * (sp - speedCap)) / sp
            ax -= k * b.vx * b.e
            ay -= k * b.vy * b.e
          }
        }
        // open palm + a moving hand: random balls drift slowly the way the hand moves
        if (drift > 0) {
          const gust = Math.sin(this.time * b.wander * 1.7 + b.phase * 2.3)
          const pick = Math.min(1, Math.max(0, (gust - driftPickFrom) / T.driftSoft))
          const w = drift * pick * pick * (3 - 2 * pick)
          ax += driftDir.x * driftAccel * w * lev
          ay += driftDir.y * driftAccel * w * lev
        }
        // gentle wander so a floating swarm looks alive
        ax += Math.sin(this.time * b.wander + b.phase) * T.wanderAccel * lev
        ay += Math.cos(this.time * b.wander * 1.3 + b.phase * 1.7) * T.wanderAccel * lev
      }
      b.vx += ax * dt
      b.vy += ay * dt
      b.x += b.vx * dt
      b.y += b.vy * dt
    }

    // a few relaxation passes so a pile against the floor resolves instead of sinking into itself
    for (let pass = 0; pass < 4; pass++) {
      this.separate()
      this.collideBounds()
    }
  }

  /**
   * Decides the order the stream catches the balls: the head (furthest along the finger) first, then back along the
   * swarm, a little later for balls further off the line. The timing is the same for any swarm size.
   */
  private assignStreamOrder(dir: { x: number; y: number }, c: { x: number; y: number }) {
    let minA = Infinity
    let maxA = -Infinity
    let maxAcross = 1
    for (const b of this.balls) {
      const along = (b.x - c.x) * dir.x + (b.y - c.y) * dir.y
      minA = Math.min(minA, along)
      maxA = Math.max(maxA, along)
      maxAcross = Math.max(maxAcross, Math.abs(-(b.x - c.x) * dir.y + (b.y - c.y) * dir.x))
    }
    const span = Math.max(maxA - minA, 1)
    for (const b of this.balls) {
      const along = (b.x - c.x) * dir.x + (b.y - c.y) * dir.y
      const across = Math.abs(-(b.x - c.x) * dir.y + (b.y - c.y) * dir.x)
      b.tau =
        (TUNING.streamReachTime * (maxA - along)) / span +
        (TUNING.streamSideTime * across) / maxAcross
    }
  }

  /** Balls may touch freely, but not overlap: only a position correction when two would interpenetrate (no force, no spreading). */
  private separate() {
    const min = this.radius * 2
    const n = this.balls.length
    for (let i = 0; i < n; i++) {
      const a = this.balls[i]!
      for (let j = i + 1; j < n; j++) {
        const b = this.balls[j]!
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d2 = dx * dx + dy * dy
        if (d2 >= min * min) continue
        const d = Math.sqrt(d2) || 0.0001
        const push = (min - d) / 2
        const nx = dx / d
        const ny = dy / d
        a.x -= nx * push
        a.y -= ny * push
        b.x += nx * push
        b.y += ny * push
      }
    }
  }

  private collideBounds() {
    const r = this.radius
    for (const b of this.balls) {
      if (b.x < r) {
        b.x = r
        b.vx = Math.abs(b.vx) * TUNING.restitution
      } else if (b.x > this.width - r) {
        b.x = this.width - r
        b.vx = -Math.abs(b.vx) * TUNING.restitution
      }
      if (b.y < r) {
        b.y = r
        b.vy = Math.abs(b.vy) * TUNING.restitution
      }
      if (b.y > this.floorY) {
        b.y = this.floorY
        b.vy = -Math.abs(b.vy) * TUNING.restitution
        if (Math.abs(b.vy) < 30) b.vy = 0
        b.vx *= TUNING.floorFriction
      }
    }
  }
}
