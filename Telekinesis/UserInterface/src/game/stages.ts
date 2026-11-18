import { PhysicsWorld, type Prop } from './physics'
import type { Distractor } from './distractors'

/**
 * The five Arena stages. Each is a builder that fills a physics world (and a list of distractors) for a given world size.
 * Objects have fixed physical sizes (a crate is 120 units, a balloon 70 across its radius…); only POSITIONS follow the
 * window — they are laid out in a 6875-unit-wide "design space" around the centre and squeezed in x if the window is
 * narrower. The start heap (centre ± ~400 units) is always left free.
 */
export type GoalKind = 'pop' | 'ring' | 'dominoes' | 'topple' | 'mixed'

export interface Stage {
  id: string
  name: string
  /** one line shown to the player: what to do and with which gesture */
  hint: string
  goal: GoalKind
  build(env: StageEnv): void
}

export interface StageEnv {
  phys: PhysicsWorld
  distractors: Distractor[]
  width: number
  /** y of the top of the floor */
  floor: number
  /** world x for a design-space offset from the centre */
  x(dx: number): number
}

/** the size every layout is designed for (a 1100 px window at the default zoom) */
export const DESIGN_WIDTH = 6875

/** physical sizes (world units) */
export const SIZES = {
  crate: 120,
  dominoHw: 12,
  dominoHh: 60,
  balloonR: 70,
  gongR: 85,
  boulderR: 90,
  wreckR: 100,
}

/** crates are light and a bit slippery so a comet can topple a stack (see the probes in `coupling.ts`) */
export const CRATE = { density: 1.4, friction: 0.35, restitution: 0.1 }

export const GOALS = {
  /** dominoes that must go over (tilt > 60°) in the Domino Rally */
  dominoesNeeded: 24,
  /** crates that must be knocked sideways by more than `displacedBy` units in the Wrecking Ball stage */
  cratesNeeded: 12,
  displacedBy: 250,
}

/** the ropes in the layouts are for a tall window; a short one gets them shortened so every balloon stays on screen */
const ROPE_STRETCH = 1.5
const ROOM_ABOVE = 350

function balloon(env: StageEnv, dx: number, designRope: number): Prop {
  const { phys, floor } = env
  const ropeLength = Math.min(designRope * ROPE_STRETCH, floor - ROOM_ABOVE)
  const ax = env.x(dx)
  const anchor = phys.addBox('anchor', ax, floor - 4, 4, 4, { static: true })
  // built already taut, so the stage starts calm
  const b = phys.addCircle('balloon', ax, floor - 4 - ropeLength, SIZES.balloonR, {
    density: 0.02,
    gravityScale: -0.3,
    linearDamping: 1.5,
    fixedRotation: true,
    friction: 0.2,
    restitution: 0.3,
  })
  phys.addRope(anchor, b, ropeLength)
  return b
}

/** A gong on a post: its centre is `height` above the floor. */
function gong(env: StageEnv, dx: number, height: number): Prop {
  const { phys, floor } = env
  const x = env.x(dx)
  const r = SIZES.gongR
  const postHalf = Math.max(1, (height - r) / 2)
  phys.addBox('post', x, floor - postHalf, 10, postHalf, { static: true })
  return phys.addCircle('gong', x, floor - height, r, { static: true, restitution: 0.5 })
}

function crate(env: StageEnv, x: number, yBottom: number): Prop {
  const h = SIZES.crate / 2
  return env.phys.addBox('crate', x, yBottom - h, h, h, CRATE)
}

function tower(env: StageEnv, dx: number, wide: number, high: number) {
  const g = SIZES.crate + 1
  for (let r = 0; r < high; r++)
    for (let c = 0; c < wide; c++)
      crate(env, env.x(dx) + (c - (wide - 1) / 2) * g, env.floor - r * g)
}

function pyramid(env: StageEnv, dx: number, base: number) {
  const g = SIZES.crate + 2
  for (let r = 0; r < base; r++)
    for (let c = 0; c < base - r; c++)
      crate(env, env.x(dx) + (c - (base - 1 - r) / 2) * g, env.floor - r * (SIZES.crate + 1))
}

export const STAGES: Stage[] = [
  {
    id: 'pop-garden',
    name: 'Pop Garden',
    hint: 'Pop every balloon — a fast comet straight up pops several at once',
    goal: 'pop',
    build(env) {
      // two straight above the start heap, one over the other (one vertical comet pops both: a first combo),
      // the rest spread out left and right
      const dxs = [-2400, -1500, -750, 0, 0, 750, 1500, 2400]
      const ropes = [1000, 1400, 1100, 1000, 1700, 1100, 1400, 1000]
      dxs.forEach((dx, i) => balloon(env, dx, ropes[i]!))
    },
  },
  {
    id: 'pyramid-gongs',
    name: 'Pyramid & Gongs',
    hint: 'Ring all three gongs — hit them hard, or knock things into them',
    goal: 'ring',
    build(env) {
      pyramid(env, 1900, 7)
      gong(env, -2300, 800)
      gong(env, -1500, 1300)
      gong(env, -700, 1800)
    },
  },
  {
    id: 'domino-rally',
    name: 'Domino Rally',
    hint: 'Tip the first domino and watch the rally go — topple 24 of 30',
    goal: 'dominoes',
    build(env) {
      const n = 30
      const x0 = env.x(600)
      const spacing = Math.min(80, (env.width * 0.46) / n)
      for (let i = 0; i < n; i++)
        env.phys.addBox(
          'domino',
          x0 + i * spacing,
          env.floor - SIZES.dominoHh,
          SIZES.dominoHw,
          SIZES.dominoHh,
          {
            density: 2,
            friction: 0.35,
          },
        )
      // a low gong at the end of the line, for the last domino to ring
      const x = x0 + (n - 1) * spacing + 170
      env.phys.addBox('post', x, env.floor - 20, 10, 20, { static: true })
      env.phys.addCircle('gong', x, env.floor - 150, SIZES.gongR, {
        static: true,
        restitution: 0.5,
      })
    },
  },
  {
    id: 'wrecking-ball',
    name: 'Wrecking Ball',
    hint: 'Swing the wrecking ball into the tower — knock 12 crates sideways',
    goal: 'topple',
    build(env) {
      tower(env, 2300, 2, 10)
      const ax = env.x(900)
      const ay = env.floor - 2000
      const anchor = env.phys.addBox('anchor', ax, ay, 8, 8, { static: true })
      const length = 1600
      const ball = env.phys.addCircle('wreck', ax, ay + length, SIZES.wreckR, {
        density: 8,
        friction: 0.3,
        restitution: 0.2,
        angularDamping: 0.5,
      })
      env.phys.addRod(anchor, ball, length)
    },
  },
  {
    id: 'moths-whirlpool',
    name: 'Moths & Whirlpool',
    hint: 'Pop the balloons, ring the gongs — mind the lanterns, the fan and the whirlpool',
    goal: 'mixed',
    build(env) {
      const dxs = [-2600, -1900, -1200, 1300, 1700, 2600]
      const ropes = [1100, 1400, 1000, 1400, 1200, 1000]
      dxs.forEach((dx, i) => balloon(env, dx, ropes[i]!))
      gong(env, -2300, 900)
      gong(env, 2000, 1200)
      const fy = env.floor - 700
      env.distractors.push(
        { kind: 'lantern', x: env.x(1200), y: env.floor - 1400, radius: 900 },
        { kind: 'lantern', x: env.x(2500), y: env.floor - 900, radius: 900 },
        { kind: 'whirlpool', x: env.x(-1700), y: env.floor - 760, radius: 800, core: 90 },
        // starts OFF for the first 3 s, so the stage is calm while it settles
        {
          kind: 'fan',
          x: env.x(1100),
          y: fy,
          w: 800,
          h: 700,
          dir: { x: 1, y: 0 },
          period: 6,
          onTime: 3,
          offset: 3,
        },
      )
    },
  },
]
