import type { Ball, Swarm } from './swarm'
import { PhysicsWorld, type Impact, type Prop } from './physics'
import { couple, type BallHit } from './coupling'
import { applyDistractors, type Distractor } from './distractors'
import { DESIGN_WIDTH, GOALS, STAGES, type Stage } from './stages'

/**
 * The Arena: a stage full of props and distractions, a goal, a score and a combo. Pure logic — no Vue, no canvas.
 * The view calls `update(dt, swarm)` once per frame (after the swarm's own step), then draws `phys.props`,
 * `distractors` and `effects`, and plays the sounds for `drainEvents()`.
 */
export const ARENA = {
  /** a scoring event inside this window (s) of the previous one raises the combo */
  comboWindow: 2.5,
  maxMultiplier: 8,
  points: { pop: 100, gong: 250, gongAgain: 25, domino: 20, crash: 10, clear: 1000 },
  /** closing speeds (m/s) needed: a drifting ball brushing a balloon (~3) does not pop it, a comet (≥ 10) does */
  popSpeed: 4,
  ringSpeed: 1.5,
  /** a crate / boulder / domino has to land this hard to count as a crash (a toppling tower: ~15–25) */
  crashSpeed: 6,
  crashCooldown: 0.6,
  /** impacts in the first seconds after a stage is built are the props settling, not play */
  settleTime: 1.5,
  /** a domino counts as fallen when it is tilted more than 60° */
  dominoTilt: Math.sin((60 * Math.PI) / 180),
  /** a gong can ring again after this long (s) */
  gongRearm: 0.5,
}

export interface ArenaEvent {
  type: 'pop' | 'ring' | 'thud' | 'score' | 'clear' | 'swallow'
  x: number
  y: number
  /** 0..1 for thuds */
  strength?: number
  /** the step of the combo ladder for `score` / `ring` */
  note?: number
}

/** Something drawn briefly, as outlines only. */
export interface Effect {
  kind: 'ring' | 'burst' | 'text'
  x: number
  y: number
  age: number
  life: number
  /** radius from → to (rings and bursts) */
  r0: number
  r1: number
  text?: string
}

export interface Goal {
  have: number
  need: number
  label: string
}

export class Arena {
  phys!: PhysicsWorld
  distractors: Distractor[] = []
  effects: Effect[] = []
  stageIndex: number
  score = 0
  /** the combo count (0 = none) and the seconds left before it runs out */
  combo = 0
  comboLeft = 0
  cleared = false
  goal: Goal = { have: 0, need: 1, label: '' }
  /** arena clock, seconds since the stage was built */
  t = 0
  private events: ArenaEvent[] = []
  private scoreAtStart = 0
  private settled = false

  constructor(
    public width: number,
    public height: number,
    /** y of the top of the floor (world units) */
    public floor: number,
    stageIndex = 0,
  ) {
    this.stageIndex = Math.max(0, Math.min(stageIndex, STAGES.length - 1))
    this.build()
  }

  get stage(): Stage {
    return STAGES[this.stageIndex]!
  }

  get stageCount(): number {
    return STAGES.length
  }

  get multiplier(): number {
    return this.combo > 0 ? Math.min(ARENA.maxMultiplier, this.combo) : 1
  }

  /** (Re)build the current stage from scratch. */
  private build() {
    this.phys?.destroy()
    this.phys = new PhysicsWorld(this.width, this.height, this.floor)
    this.distractors = []
    this.effects = []
    this.events = []
    this.t = 0
    this.combo = 0
    this.comboLeft = 0
    this.cleared = false
    this.settled = false
    const sx = Math.min(1, this.width / DESIGN_WIDTH)
    this.stage.build({
      phys: this.phys,
      distractors: this.distractors,
      width: this.width,
      floor: this.floor,
      x: (dx: number) => this.width / 2 + dx * sx,
    })
    this.goal = this.measureGoal(true)
  }

  /** Start the current stage again (the score goes back to what it was when the stage began). The caller resets the swarm. */
  restart(): void {
    this.score = this.scoreAtStart
    this.build()
  }

  /** The window changed size: lay the current stage out again for the new world (the score is kept). */
  resizeTo(width: number, height: number, floor: number): void {
    this.width = width
    this.height = height
    this.floor = floor
    this.build()
  }

  get hasNext(): boolean {
    return this.stageIndex < STAGES.length - 1
  }

  /** Go to the next stage — only once this one is cleared. Returns whether it moved. */
  next(): boolean {
    if (!this.cleared || !this.hasNext) return false
    this.stageIndex++
    this.scoreAtStart = this.score
    this.build()
    return true
  }

  /** Free the physics world. */
  destroy(): void {
    this.phys?.destroy()
  }

  /** The events since the last call (for the sounds). */
  drainEvents(): ArenaEvent[] {
    const out = this.events
    this.events = []
    return out
  }

  // ---------------------------------------------------------------- the frame

  update(dt: number, swarm: Swarm): void {
    dt = Math.min(Math.max(dt, 0), 0.1)
    this.t += dt
    if (!this.settled && this.t >= ARENA.settleTime) this.settled = true

    const swallowed = applyDistractors(this.distractors, swarm, this.phys, this.t, dt, (b, i) =>
      this.recycle(swarm, b, i),
    )
    if (swallowed > 0) {
      this.events.push({ type: 'swallow', x: 0, y: 0 })
    }

    this.onBallHits(couple(swarm, this.phys))
    this.phys.step(dt)
    this.onImpacts(this.phys.drainImpacts())
    this.checkDominoes()

    this.goal = this.measureGoal(false)
    if (!this.cleared && this.goal.have >= this.goal.need) this.clear()

    if (this.comboLeft > 0) {
      this.comboLeft -= dt
      if (this.comboLeft <= 0) {
        this.comboLeft = 0
        this.combo = 0
      }
    }
    for (const e of this.effects) e.age += dt
    this.effects = this.effects.filter((e) => e.age < e.life)
  }

  /** A swallowed ball goes back to the start heap (the swarm always stays 60 balls). */
  private recycle(swarm: Swarm, b: Ball, i: number) {
    b.x = this.width / 2 + (((i * 0.618034) % 1) - 0.5) * swarm.cloud * 2.4
    b.y = swarm.floorY - (i % 5) * swarm.radius * 0.8 - 2
    b.vx = 0
    b.vy = 0
    b.lev = 0
    b.e = 0
  }

  // ---------------------------------------------------------------- rules

  private onBallHits(hits: BallHit[]) {
    for (const h of hits) {
      const p = h.prop
      if (!p.alive) continue
      if (p.kind === 'balloon' && h.speed >= ARENA.popSpeed) this.pop(p)
      else if (p.kind === 'gong' && h.speed >= ARENA.ringSpeed) this.ring(p)
    }
  }

  private onImpacts(impacts: Impact[]) {
    for (const im of impacts) {
      if (!this.settled) continue // the props settling
      const { a, b } = im
      for (const [x, y] of [
        [a, b],
        [b, a],
      ] as const) {
        if (!x.alive) continue
        if (x.kind === 'balloon' && y.alive && !isScenery(y) && im.speed >= ARENA.popSpeed)
          this.pop(x)
        else if (x.kind === 'gong' && y.alive && y.body.isDynamic() && im.speed >= ARENA.ringSpeed)
          this.ring(x)
      }
      // a heavy thing landing hard
      for (const p of [a, b]) {
        if (!p.alive || !isHeavy(p)) continue
        if (im.speed >= ARENA.crashSpeed && this.t - p.lastCrashAt >= ARENA.crashCooldown) {
          p.lastCrashAt = this.t
          this.addRing(im.x, im.y, 30, 130, 0.3)
          this.events.push({ type: 'thud', x: im.x, y: im.y, strength: Math.min(1, im.speed / 25) })
          this.award(ARENA.points.crash, im.x, im.y)
        }
      }
    }
  }

  private pop(balloon: Prop) {
    const c = this.phys.pos(balloon)
    balloon.popped = true
    this.phys.remove(balloon)
    this.addRing(c.x, c.y, 70, 240, 0.45)
    this.effects.push({ kind: 'burst', x: c.x, y: c.y, age: 0, life: 0.5, r0: 80, r1: 260 })
    this.events.push({ type: 'pop', x: c.x, y: c.y })
    this.award(ARENA.points.pop, c.x, c.y)
  }

  private ring(g: Prop) {
    if (this.t - g.lastRingAt < ARENA.gongRearm) return
    g.lastRingAt = this.t
    g.rungCount++
    const c = this.phys.pos(g)
    this.addRing(c.x, c.y, 85, 420, 0.9)
    this.addRing(c.x, c.y, 85, 280, 0.6)
    const first = g.rungCount === 1
    this.award(first ? ARENA.points.gong : ARENA.points.gongAgain, c.x, c.y)
    this.events.push({ type: 'ring', x: c.x, y: c.y, note: Math.max(0, this.combo - 1) })
  }

  private checkDominoes() {
    for (const p of this.phys.props) {
      if (p.kind !== 'domino' || p.counted) continue
      if (Math.abs(Math.sin(this.phys.angle(p))) > ARENA.dominoTilt) {
        p.counted = true
        const c = this.phys.pos(p)
        this.award(ARENA.points.domino, c.x, c.y)
      }
    }
  }

  private clear() {
    this.cleared = true
    this.score += ARENA.points.clear
    const x = this.width / 2
    const y = this.floor - 1500
    this.addRing(x, y, 100, 900, 1.2)
    this.addRing(x, y, 100, 600, 0.9)
    this.effects.push({
      kind: 'text',
      x,
      y,
      age: 0,
      life: 1.6,
      r0: 0,
      r1: 0,
      text: `+${ARENA.points.clear}`,
    })
    this.events.push({ type: 'clear', x, y })
  }

  /** Points × the combo multiplier; every scoring event inside the window raises the combo. */
  award(points: number, x: number, y: number): number {
    this.combo = this.comboLeft > 0 ? this.combo + 1 : 1
    this.comboLeft = ARENA.comboWindow
    const mult = Math.min(ARENA.maxMultiplier, this.combo)
    const gained = points * mult
    this.score += gained
    this.effects.push({
      kind: 'text',
      x,
      y: y - 90,
      age: 0,
      life: 1,
      r0: 0,
      r1: 0,
      text: mult > 1 ? `+${gained} ×${mult}` : `+${gained}`,
    })
    this.events.push({ type: 'score', x, y, note: this.combo - 1 })
    return gained
  }

  private addRing(x: number, y: number, r0: number, r1: number, life: number) {
    this.effects.push({ kind: 'ring', x, y, age: 0, life, r0, r1 })
  }

  /** How far the player is: counts straight from the props. `initial` computes only the target. */
  measureGoal(initial: boolean): Goal {
    const props = this.phys.props
    const count = (k: Prop['kind']) => props.filter((p) => p.kind === k).length
    switch (this.stage.goal) {
      case 'pop': {
        // popped balloons are removed from the world, so the target is fixed when the stage is built
        const need = initial ? count('balloon') : this.goal.need
        return { need, have: initial ? 0 : need - count('balloon'), label: 'balloons popped' }
      }
      case 'ring': {
        const gongs = props.filter((p) => p.kind === 'gong')
        return {
          need: gongs.length,
          have: gongs.filter((g) => g.rungCount > 0).length,
          label: 'gongs rung',
        }
      }
      case 'dominoes': {
        const need = Math.min(GOALS.dominoesNeeded, count('domino'))
        return {
          need,
          have: Math.min(need, props.filter((p) => p.kind === 'domino' && p.counted).length),
          label: 'dominoes toppled',
        }
      }
      case 'topple': {
        const crates = props.filter((p) => p.kind === 'crate')
        const need = Math.min(GOALS.cratesNeeded, crates.length)
        const moved = crates.filter(
          (c) => Math.abs(this.phys.pos(c).x - c.home.x) > GOALS.displacedBy,
        ).length
        return { need, have: Math.min(need, moved), label: 'crates knocked over' }
      }
      case 'mixed': {
        const gongs = props.filter((p) => p.kind === 'gong')
        const balloonsNeed = initial ? count('balloon') : this.mixedBalloons
        if (initial) this.mixedBalloons = balloonsNeed
        const popped = initial ? 0 : balloonsNeed - count('balloon')
        const rung = gongs.filter((g) => g.rungCount > 0).length
        return {
          need: balloonsNeed + gongs.length,
          have: popped + rung,
          label: 'balloons popped and gongs rung',
        }
      }
    }
  }

  private mixedBalloons = 0
}

/** posts, anchors, the platforms: things that stand for the world, not for something to hit */
function isScenery(p: Prop): boolean {
  return (
    p.kind === 'anchor' ||
    p.kind === 'ground' ||
    p.kind === 'wall' ||
    p.kind === 'post' ||
    p.kind === 'platform'
  )
}

function isHeavy(p: Prop): boolean {
  return p.kind === 'crate' || p.kind === 'boulder' || p.kind === 'wreck' || p.kind === 'domino'
}
