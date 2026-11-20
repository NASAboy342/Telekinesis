// The tutorial: a short guided lesson on the real stage. Each step names one gesture and is done when the player has
// really held it for a moment (so it teaches by doing, with the camera or with the mouse fallback). Pure logic:
// the view feeds it what the hand is doing every frame and draws the card.
import type { IconName } from '@/components/icons/icons'
import type { Pose } from '@/helpers/gestures'

/** What the player's hand is doing right now (one sample per frame). */
export interface Observation {
  present: boolean
  pose: Pose
  /** how fast the open hand moves, in frame-heights per second (0 when it is not an open hand) */
  drift: number
  /** 0..1 how tightly thumb and index are pinched (the mouse fallback sends an open palm plus a pinch) */
  pinch: number
  /** the swarm is braking because of the stop gesture */
  stopping: boolean
}

export interface TutorialStep {
  id: 'hand' | 'lift' | 'wave' | 'point' | 'circle' | 'clump' | 'drop' | 'stop'
  icon: IconName
  title: string
  /** what to do with the camera */
  hint: string
  /** the same with the mouse fallback */
  mouse: string
  /** what it does: shown once the step is done */
  result: string
  /** seconds the gesture has to be held */
  hold: number
  met: (o: Observation) => boolean
}

export const TUTORIAL = {
  /** an open hand counts as "waving" above this speed (frame-heights per second) */
  waveSpeed: 0.3,
  /** while the gesture is not held the progress drains this many times faster than it fills */
  drain: 2,
  /** a breath between steps so the player can read the result before the next one can complete */
  settle: 0.7,
  /** longest frame we integrate (a stalled tab must not complete a step) */
  maxDt: 0.1,
}

export const STEPS: readonly TutorialStep[] = [
  {
    id: 'hand',
    icon: 'camera',
    title: 'Show your hand',
    hint: 'Press Use camera and hold a hand up, about an arm’s length away.',
    mouse: 'Press the mouse button in the top bar, then hold the left mouse button.',
    result: 'The swarm sees you.',
    hold: 0.5,
    // a fist is what the mouse fallback sends while nothing is pressed, so it does not count as "showing a hand"
    met: (o) => o.present && o.pose !== 'fist',
  },
  {
    id: 'lift',
    icon: 'hand',
    title: 'Open palm: float',
    hint: 'Open your palm. Gravity switches off and the balls lift and float.',
    mouse: 'Keep holding the mouse button.',
    result: 'Floating: the balls keep their speed and the air slowly stops them.',
    hold: 1,
    met: (o) => o.pose === 'open',
  },
  {
    id: 'wave',
    icon: 'move-horizontal',
    title: 'Wave: drift',
    hint: 'Keep the palm open and wave. A random handful of balls drifts the way you move. Closer = stronger.',
    mouse: 'Hold the mouse button and move the pointer. The wheel sets the distance.',
    result: 'Waves nudge, they never steer: a gentle push for light things.',
    hold: 1.2,
    met: (o) => o.pose === 'open' && o.drift > TUTORIAL.waveSpeed,
  },
  {
    id: 'point',
    icon: 'arrow-up',
    title: 'Point: comet',
    hint: 'Point with your index finger. The swarm streams that way, head first, like a comet. A closer hand is faster.',
    mouse: 'Hold an arrow key (or W A S D).',
    result: 'The longer you point, the faster it flies. This is your battering ram.',
    hold: 1.2,
    met: (o) => o.pose === 'point',
  },
  {
    id: 'circle',
    icon: 'fingers-two',
    title: 'Two fingers: circle',
    hint: 'Show index and middle finger. The swarm circles around its centre.',
    mouse: 'Hold Shift while the mouse button is down.',
    result: 'A spinning ring: good for sweeping things off a shelf.',
    hold: 1.2,
    met: (o) => o.pose === 'two',
  },
  {
    id: 'clump',
    icon: 'crosshair',
    title: 'Pinch: clump',
    hint: 'Pinch thumb and index finger. The balls pull together and stay clumped when you let go.',
    mouse: 'Hold Alt while the mouse button is down.',
    result: 'A tight clump hits much harder than a loose cloud.',
    hold: 1,
    met: (o) => o.pose === 'pinch' || o.pinch > 0.5,
  },
  {
    id: 'drop',
    icon: 'circle-dot',
    title: 'Fist: drop',
    hint: 'Close your fist with the palm toward the camera. Gravity is back and everything falls.',
    mouse: 'Release the mouse button.',
    result: 'Dropping is a move too: let the clump fall on something.',
    hold: 0.6,
    met: (o) => o.present && o.pose === 'fist',
  },
  {
    id: 'stop',
    icon: 'stop',
    title: 'Both hands open: stop',
    hint: 'Show both open palms for a moment. The swarm brakes to a standstill and keeps floating. It rescues a swarm that wandered off.',
    mouse: 'Hold Space.',
    result: 'Calm again.',
    hold: 0.5,
    met: (o) => o.stopping,
  },
]

export class Tutorial {
  /** index of the current step; STEPS.length means finished */
  index = 0
  /** seconds the current gesture has been held (drains when it is let go) */
  held = 0
  private settle = 0
  /** the step that was just completed (for the "well done" line), null before the first one */
  last: TutorialStep | null = null

  get done(): boolean {
    return this.index >= STEPS.length
  }
  get step(): TutorialStep | null {
    return STEPS[this.index] ?? null
  }
  /** 0..1 of the current step */
  get progress(): number {
    const s = this.step
    return s ? Math.min(1, this.held / s.hold) : 1
  }

  /** Feed one frame. Returns true when this frame completed a step. */
  update(dt: number, o: Observation): boolean {
    const s = this.step
    if (!s) return false
    const d = Math.min(Math.max(dt, 0), TUTORIAL.maxDt)
    if (this.settle > 0) {
      this.settle = Math.max(0, this.settle - d)
      return false
    }
    this.held = s.met(o) ? this.held + d : Math.max(0, this.held - d * TUTORIAL.drain)
    if (this.held < s.hold) return false
    this.advance()
    return true
  }

  /** Skip the current step (a gesture the camera cannot see well, or the player knows it already). */
  skip(): void {
    if (this.step) this.advance()
  }

  restart(): void {
    this.index = 0
    this.held = 0
    this.settle = 0
    this.last = null
  }

  private advance(): void {
    this.last = this.step
    this.index++
    this.held = 0
    this.settle = TUTORIAL.settle
  }
}
