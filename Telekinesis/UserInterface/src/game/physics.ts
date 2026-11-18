import * as pl from 'planck'

/**
 * The rigid-body side of the Arena (planck.js = Box2D): crates, dominoes, boulders, balloons, gongs, ropes…
 * The swarm keeps its own force model (`swarm.ts`); `coupling.ts` makes the two worlds touch.
 *
 * Units: the game's world units (100 units = 1 m). Planck works in metres, so every public method here takes and
 * returns world units and converts internally. The canvas is y-down, so gravity simply points to +y.
 */
export const PHYS = {
  /** metres per world unit */
  scale: 0.01,
  /** m/s² — a touch stronger than Earth so toppling feels crisp rather than floaty */
  gravity: 30,
  /** fixed physics step (s) and the most steps run per frame (a slow frame is slowed down, never exploded) */
  step: 1 / 120,
  maxSteps: 4,
  velocityIterations: 8,
  positionIterations: 3,
  /** contacts softer than this relative speed (m/s) are not reported as impacts (resting contacts are noise) */
  minImpactSpeed: 0.6,
}

export type PropKind =
  | 'crate'
  | 'domino'
  | 'boulder'
  | 'wreck'
  | 'balloon'
  | 'gong'
  | 'platform'
  | 'post'
  | 'anchor'
  | 'ground'
  | 'wall'

export type PropShape = { type: 'box'; hw: number; hh: number } | { type: 'circle'; r: number }

/** A thing in the Arena. Game-state flags live on it so the rules (`arena.ts`) stay simple. */
export interface Prop {
  id: number
  kind: PropKind
  /** size in world units (half extents / radius) — used by the coupling and the drawing */
  shape: PropShape
  body: pl.Body
  alive: boolean
  /** where it was built (for "displaced" goals) */
  home: { x: number; y: number }
  /** a rope / rod that ties it to an anchor */
  joint?: pl.Joint
  anchor?: Prop
  /** the point of the prop the rope is tied to, in world units from its centre */
  tie?: { x: number; y: number }
  // rule state
  popped: boolean
  rungCount: number
  lastRingAt: number
  counted: boolean
  lastCrashAt: number
}

/** A hit between two props, as felt by the solver. `speed` ≈ the relative normal speed of the hit, in m/s. */
export interface Impact {
  a: Prop
  b: Prop
  speed: number
  /** world units */
  x: number
  y: number
}

export interface BodyOpts {
  static?: boolean
  angle?: number
  density?: number
  friction?: number
  restitution?: number
  fixedRotation?: boolean
  linearDamping?: number
  angularDamping?: number
  gravityScale?: number
  bullet?: boolean
}

const S = PHYS.scale

export class PhysicsWorld {
  readonly world: pl.World
  readonly props: Prop[] = []
  /** impacts since the last `drainImpacts()` */
  private impacts: Impact[] = []
  private acc = 0
  private nextId = 1
  /** simulated seconds */
  time = 0

  constructor(
    public readonly width: number,
    public readonly height: number,
    /** y (world units) of the top of the floor */
    public readonly floorLine: number,
  ) {
    this.world = new pl.World({ gravity: pl.Vec2(0, PHYS.gravity) })
    // the ground and the side walls (not in `props`: they are never drawn or hit by the swarm — its own floor / walls do that)
    const wall = (x: number, y: number, hw: number, hh: number, kind: 'ground' | 'wall') => {
      const body = this.world.createBody({ type: 'static', position: pl.Vec2(x * S, y * S) })
      body.createFixture({ shape: new pl.Box(hw * S, hh * S), friction: 0.8, restitution: 0 })
      body.setUserData(this.makeProp(kind, { type: 'box', hw, hh }, body, x, y))
    }
    wall(width / 2, floorLine + 50, width / 2 + 200, 50, 'ground')
    wall(-50, floorLine / 2 - 2000, 50, floorLine / 2 + 4000, 'wall')
    wall(width + 50, floorLine / 2 - 2000, 50, floorLine / 2 + 4000, 'wall')
    this.world.on('post-solve', (contact, impulse) => this.onPostSolve(contact, impulse))
  }

  private makeProp(kind: PropKind, shape: PropShape, body: pl.Body, x: number, y: number): Prop {
    return {
      id: this.nextId++,
      kind,
      shape,
      body,
      alive: true,
      home: { x, y },
      popped: false,
      rungCount: 0,
      lastRingAt: -Infinity,
      counted: false,
      lastCrashAt: -Infinity,
    }
  }

  private build(kind: PropKind, shape: PropShape, x: number, y: number, o: BodyOpts): Prop {
    const body = this.world.createBody({
      type: o.static ? 'static' : 'dynamic',
      position: pl.Vec2(x * S, y * S),
      angle: o.angle ?? 0,
      fixedRotation: o.fixedRotation ?? false,
      linearDamping: o.linearDamping ?? 0,
      angularDamping: o.angularDamping ?? 0,
      bullet: o.bullet ?? false,
    })
    const fixtureShape =
      shape.type === 'box' ? new pl.Box(shape.hw * S, shape.hh * S) : new pl.Circle(shape.r * S)
    body.createFixture({
      shape: fixtureShape,
      density: o.density ?? 1,
      friction: o.friction ?? 0.6,
      restitution: o.restitution ?? 0.1,
    })
    if (o.gravityScale !== undefined) body.setGravityScale(o.gravityScale)
    const prop = this.makeProp(kind, shape, body, x, y)
    body.setUserData(prop)
    this.props.push(prop)
    return prop
  }

  /** A box centred on (x, y), `hw` / `hh` = half width / height in world units. */
  addBox(kind: PropKind, x: number, y: number, hw: number, hh: number, o: BodyOpts = {}): Prop {
    return this.build(kind, { type: 'box', hw, hh }, x, y, o)
  }

  addCircle(kind: PropKind, x: number, y: number, r: number, o: BodyOpts = {}): Prop {
    return this.build(kind, { type: 'circle', r }, x, y, o)
  }

  /** A slack-able rope (holds a balloon back; goes loose when the ends come closer than `length`). */
  addRope(anchor: Prop, prop: Prop, length: number, tie = { x: 0, y: 0 }): void {
    prop.anchor = anchor
    prop.tie = tie
    prop.joint = this.world.createJoint(
      new pl.RopeJoint({
        bodyA: anchor.body,
        bodyB: prop.body,
        localAnchorA: pl.Vec2(0, 0),
        localAnchorB: pl.Vec2(tie.x * S, tie.y * S),
        maxLength: length * S,
      }),
    ) as pl.Joint
  }

  /** A rigid rod / chain of fixed length (a pendulum: the wrecking ball). */
  addRod(anchor: Prop, prop: Prop, length: number, tie = { x: 0, y: 0 }): void {
    prop.anchor = anchor
    prop.tie = tie
    prop.joint = this.world.createJoint(
      new pl.DistanceJoint({
        bodyA: anchor.body,
        bodyB: prop.body,
        localAnchorA: pl.Vec2(0, 0),
        localAnchorB: pl.Vec2(tie.x * S, tie.y * S),
        length: length * S,
        frequencyHz: 0,
        dampingRatio: 0,
      }),
    ) as pl.Joint
  }

  /** Removes a prop (and its rope / rod). Safe to call more than once. */
  remove(prop: Prop): void {
    if (!prop.alive) return
    prop.alive = false
    // destroying a body destroys the ropes / rods attached to it (as the anchor OR as the thing hanging): forget them
    this.world.destroyBody(prop.body)
    prop.joint = undefined
    for (const q of this.props) {
      if (q.anchor === prop) {
        q.joint = undefined
        q.anchor = undefined
      }
    }
    const i = this.props.indexOf(prop)
    if (i >= 0) this.props.splice(i, 1)
  }

  /** Centre of a prop, world units. */
  pos(prop: Prop): { x: number; y: number } {
    const p = prop.body.getPosition()
    return { x: p.x / S, y: p.y / S }
  }

  angle(prop: Prop): number {
    return prop.body.getAngle()
  }

  /** Speed of a prop's centre, world units / s. */
  speed(prop: Prop): number {
    const v = prop.body.getLinearVelocity()
    return Math.hypot(v.x, v.y) / S
  }

  /** The tie point of a roped prop in world coordinates (units), e.g. the bottom of a balloon where its string is knotted. */
  tiePoint(prop: Prop): { x: number; y: number } {
    const t = prop.tie ?? { x: 0, y: 0 }
    const p = prop.body.getWorldPoint(pl.Vec2(t.x * S, t.y * S))
    return { x: p.x / S, y: p.y / S }
  }

  /** Advance by `dt` seconds with fixed sub-steps (deterministic for a given sequence of dt). */
  step(dt: number): void {
    this.acc = Math.min(this.acc + Math.max(dt, 0), PHYS.step * PHYS.maxSteps)
    while (this.acc >= PHYS.step - 1e-9) {
      this.world.step(PHYS.step, PHYS.velocityIterations, PHYS.positionIterations)
      this.acc -= PHYS.step
      this.time += PHYS.step
    }
  }

  /** The hits the solver reported since the last call. */
  drainImpacts(): Impact[] {
    const out = this.impacts
    this.impacts = []
    return out
  }

  private onPostSolve(contact: pl.Contact, impulse: pl.ContactImpulse) {
    const ba = contact.getFixtureA().getBody()
    const bb = contact.getFixtureB().getBody()
    const a = ba.getUserData() as Prop | null
    const b = bb.getUserData() as Prop | null
    if (!a || !b) return
    const n = impulse.normalImpulses
    // a box lands on two contact points that each carry part of the impulse: the total is their sum
    const imp = (n[0] ?? 0) + (n[1] ?? 0)
    // impulse ÷ effective mass = how fast the two were closing: a speed that is comparable across heavy and light things
    const inv = (ba.isDynamic() ? 1 / ba.getMass() : 0) + (bb.isDynamic() ? 1 / bb.getMass() : 0)
    const speed = imp * inv
    if (speed < PHYS.minImpactSpeed) return
    const p = contact.getWorldManifold(null)?.points[0] ?? ba.getPosition()
    this.impacts.push({ a, b, speed, x: p.x / S, y: p.y / S })
  }

  /** Free everything. The instance must not be used afterwards. */
  destroy(): void {
    // `remove` takes the prop out of the list, so always take the first one until none are left
    while (this.props.length > 0) this.remove(this.props[0]!)
    this.impacts = []
  }
}
