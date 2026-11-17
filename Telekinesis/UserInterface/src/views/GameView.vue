<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/icons/AppIcon.vue'
import { useHandInput } from '@/composables/useHandInput'
import { Swarm, type SwarmInput, type SwarmMode } from '@/game/swarm'
import { VIEW_ZOOM } from '@/game/config'
import {
  applyAvatar,
  handToSwarmInput,
  mouseToSwarmInput,
  primaryHand,
  StopDetector,
} from '@/game/input'
import { AVATAR, AvatarSmoother, type AvatarPose } from '@/helpers/avatar'
import { GestureCode } from '@/helpers/gestureCode'
import { HAND_CONNECTIONS } from '@/helpers/handTracker'
import type { IconName } from '@/components/icons/icons'
import type { HandSignals, Pose } from '@/helpers/gestures'

const canvas = ref<HTMLCanvasElement | null>(null)
const input = useHandInput('game')
const mouseMode = ref(false)
const stopDetector = new StopDetector()
const stopping = ref(false)
// avatar mode: the hand is drawn as a small, steady character (see helpers/avatar.ts); the gesture code toggles it
const avatarMode = ref(false)
const codeProgress = ref(0)
const gestureCode = new GestureCode()
const avatarSmoother = new AvatarSmoother()
interface PlacedAvatar {
  pose: AvatarPose
  /** canvas px */
  px: number
  py: number
}
let avatar: PlacedAvatar | null = null
let avatarSide: string | null = null
let avatarLostSince = -1
const mode = ref<SwarmMode>('rest')
const pose = ref<Pose>('none')

const POSE_ICON: Record<Pose, IconName> = {
  none: 'circle',
  open: 'hand',
  fist: 'circle-dot',
  point: 'arrow-up',
  two: 'fingers-two',
  pinch: 'crosshair',
}
const MODE_ICON: Record<SwarmMode, IconName> = {
  rest: 'arrow-down',
  levitate: 'arrow-up',
  circle: 'refresh',
  move: 'arrow-right',
}
const cameraBusy = computed(() => input.phase.value === 'starting')

let swarm: Swarm | null = null
let raf = 0
let last = 0
let dpr = 1
const mouse = {
  down: false,
  shift: false,
  alt: false,
  x: 0,
  y: 0,
  t: 0,
  seen: false,
  vx: 0,
  vy: 0,
  reach: 0.5,
  stop: false,
  fistBack: false,
}
const KEY_DIR: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  a: [-1, 0],
  A: [-1, 0],
  ArrowRight: [1, 0],
  d: [1, 0],
  D: [1, 0],
  ArrowUp: [0, -1],
  w: [0, -1],
  W: [0, -1],
  ArrowDown: [0, 1],
  s: [0, 1],
  S: [0, 1],
}
const heldKeys = new Set<string>()

function keyDir() {
  let x = 0
  let y = 0
  for (const k of heldKeys) {
    x += KEY_DIR[k]![0]
    y += KEY_DIR[k]![1]
  }
  const l = Math.hypot(x, y)
  return l ? { x: x / l, y: y / l } : { x: 0, y: 0 }
}

function resize() {
  const c = canvas.value
  if (!c) return
  dpr = window.devicePixelRatio || 1
  const w = c.clientWidth
  const h = c.clientHeight
  c.width = Math.round(w * dpr)
  c.height = Math.round(h * dpr)
  // the world is bigger than the window: balls are ~3 px, there is room to roam
  const worldW = w / VIEW_ZOOM
  const worldH = h / VIEW_ZOOM
  if (!swarm) swarm = new Swarm(worldW, worldH)
  else swarm.resize(worldW, worldH)
}

function currentInput(hand: HandSignals | undefined): SwarmInput {
  // the stop gesture (both hands open, held briefly) is evaluated every frame so its hold / release timers keep running
  const stop = stopDetector.update(input.signals.value, performance.now() / 1000)
  if (hand) return handToSwarmInput(hand, stop)
  if (mouseMode.value) {
    // the pointer's velocity stands in for the open hand's motion; it fades fast when the pointer stops
    mouse.vx *= 0.88
    mouse.vy *= 0.88
    return mouseToSwarmInput(
      mouse.down,
      mouse.shift,
      mouse.alt,
      keyDir(),
      { x: mouse.vx, y: mouse.vy },
      mouse.reach,
      mouse.stop,
    )
  }
  return handToSwarmInput(undefined)
}

/** wrist + the five fingertips: the only joints drawn as circles */
const AVATAR_DOTS = [0, 4, 8, 12, 16, 20]

function toggleAvatar() {
  avatarMode.value = !avatarMode.value
  gestureCode.reset()
  codeProgress.value = 0
  avatarSmoother.reset()
  avatar = null
  avatarSide = null
  avatarLostSince = -1
}

/** Where the avatar is on the canvas (px), kept inside the canvas. */
function placeAvatar(pose: AvatarPose, w: number, h: number): PlacedAvatar {
  const m = AVATAR.handPx * 1.2
  return {
    pose,
    px: Math.min(Math.max(pose.x * w, m), Math.max(m, w - m)),
    py: Math.min(Math.max(pose.y * h, m), Math.max(m, h - m)),
  }
}

/** One hand at a time: the primary hand (or the mouse pointer in the mouse fallback) drives the steady avatar. */
function updateAvatar(hand: HandSignals | undefined, w: number, h: number, t: number) {
  if (!avatarMode.value) {
    avatar = null
    return
  }
  if (hand) {
    const lm = input.landmarks.value[hand.index]
    if (lm) {
      if (avatarSide !== hand.side) {
        avatarSmoother.reset() // a different hand: don't smooth across the swap
        avatarSide = hand.side
      }
      avatar = placeAvatar(avatarSmoother.update(lm, input.aspect.value, t), w, h)
      avatarLostSince = -1
      return
    }
  } else if (mouseMode.value && mouse.seen) {
    avatar = placeAvatar(avatarSmoother.updateFromPoint(mouse.x / w, mouse.y / h, w / h, t), w, h)
    avatarLostSince = -1
    return
  }
  // hand lost: keep showing it for a moment so a one-frame dropout doesn't blink, then forget it
  if (avatarLostSince < 0) avatarLostSince = t
  if (t - avatarLostSince > AVATAR.lostAfter) {
    avatar = null
    avatarSide = null
    avatarSmoother.reset()
  }
}

function frame(now: number) {
  raf = requestAnimationFrame(frame)
  const c = canvas.value
  if (!c || !swarm) return
  const dt = last ? (now - last) / 1000 : 0
  last = now
  const w = c.clientWidth
  const h = c.clientHeight
  const t = now / 1000
  const hand = primaryHand(input.signals.value)
  // the gesture code (fist → point → two fingers → open palm) switches avatar mode on / off
  if (gestureCode.update(hand?.pose ?? null, t)) toggleAvatar()
  if (gestureCode.progress !== codeProgress.value) codeProgress.value = gestureCode.progress
  updateAvatar(hand, w, h, t)
  let inp = currentInput(hand)
  if (avatarMode.value) {
    // a fist with the back toward the camera now circles the balls around the avatar (the centre follows it)
    const fistBack = hand ? hand.fistBack : mouseMode.value && mouse.down && mouse.fistBack
    inp = applyAvatar(
      inp,
      fistBack,
      avatar ? { x: avatar.px / VIEW_ZOOM, y: avatar.py / VIEW_ZOOM } : null,
    )
  }
  swarm.step(dt, inp)
  if (swarm.mode !== mode.value) mode.value = swarm.mode
  const braking = swarm.braking > 0.3
  if (braking !== stopping.value) stopping.value = braking
  const shown = inp.present ? inp.pose : 'none'
  if (shown !== pose.value) pose.value = shown
  draw(c.getContext('2d')!, w, h)
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const s = swarm!
  const z = VIEW_ZOOM
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.setTransform(dpr * z, 0, 0, dpr * z, 0, 0) // from here on: world units
  ctx.strokeStyle = '#000'
  // floor line (1.5 screen px wide)
  ctx.lineWidth = 1.5 / z
  const fy = s.floorY + s.radius
  ctx.beginPath()
  ctx.moveTo(0, fy)
  ctx.lineTo(w / z, fy)
  ctx.stroke()
  // balls: outline only, no fill (1.2 screen px outline)
  ctx.lineWidth = 1.2 / z
  for (const b of s.balls) {
    ctx.beginPath()
    ctx.arc(b.x, b.y, s.radius - ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (avatar) drawAvatar(ctx, avatar)
}

/** The hand skeleton from the camera spike, very small and always the same size (AVATAR.handPx). Screen px. */
function drawAvatar(ctx: CanvasRenderingContext2D, a: PlacedAvatar) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const k = AVATAR.handPx
  const at = (i: number) => [a.px + a.pose.local[i]!.x * k, a.py + a.pose.local[i]!.y * k] as const
  ctx.strokeStyle = '#000'
  ctx.fillStyle = '#fff'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const { start, end } of HAND_CONNECTIONS) {
    const [x1, y1] = at(start)
    const [x2, y2] = at(end)
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
  }
  ctx.stroke()
  // At this size the fingers are only ~3 px apart, so a circle on every joint turns into a ladder: the bones are plain
  // lines, and only the wrist and the five fingertips get a small outlined circle.
  for (const i of AVATAR_DOTS) {
    const [x, y] = at(i)
    ctx.beginPath()
    ctx.arc(x, y, 1.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}

function syncModifiers(e: MouseEvent | KeyboardEvent) {
  mouse.shift = e.shiftKey
  mouse.alt = e.altKey
}

function onKeyDown(e: KeyboardEvent) {
  syncModifiers(e)
  if (e.key === ' ') {
    mouse.stop = true // Space stands in for "both hands open"
    e.preventDefault()
  }
  if (e.key === 'b' || e.key === 'B') mouse.fistBack = true // a fist with the back to the camera (avatar mode)
  if (e.key in KEY_DIR) {
    heldKeys.add(e.key)
    if (e.key.startsWith('Arrow')) e.preventDefault()
  }
}

function onKeyUp(e: KeyboardEvent) {
  syncModifiers(e)
  if (e.key === ' ') mouse.stop = false
  if (e.key === 'b' || e.key === 'B') mouse.fistBack = false
  heldKeys.delete(e.key)
}

function onMove(e: MouseEvent) {
  const c = canvas.value
  if (!c) return
  const r = c.getBoundingClientRect()
  const x = e.clientX - r.left
  const y = e.clientY - r.top
  const now = performance.now()
  if (mouse.seen && now > mouse.t) {
    const dt = (now - mouse.t) / 1000
    // frame-heights per second, light smoothing
    const vx = Math.max(-4, Math.min(4, (x - mouse.x) / r.height / dt))
    const vy = Math.max(-4, Math.min(4, (y - mouse.y) / r.height / dt))
    mouse.vx = mouse.vx * 0.5 + vx * 0.5
    mouse.vy = mouse.vy * 0.5 + vy * 0.5
  }
  mouse.x = x
  mouse.y = y
  mouse.t = now
  mouse.seen = true
}

function onWheel(e: WheelEvent) {
  // wheel up = hand closer to the camera = the drift reaches more balls, harder
  mouse.reach = Math.min(1, Math.max(0, mouse.reach - Math.sign(e.deltaY) * 0.1))
  e.preventDefault()
}

function onDown(e: MouseEvent) {
  syncModifiers(e)
  mouse.down = true
}

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('mouseup', () => (mouse.down = false))
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <div class="relative h-full w-full select-none overflow-hidden" data-testid="game-view">
    <canvas
      ref="canvas"
      class="absolute inset-0 h-full w-full"
      data-testid="game-canvas"
      @mousemove="onMove"
      @wheel.prevent="onWheel"
      @mousedown="onDown"
    />

    <div class="absolute left-4 top-4 flex items-center gap-2">
      <RouterLink
        to="/"
        class="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface-raised text-text hover:bg-surface-hover"
        title="Back"
        aria-label="Back"
        data-testid="game-back"
      >
        <AppIcon name="arrow-left" :size="16" />
      </RouterLink>
      <button
        v-if="input.phase.value !== 'running'"
        class="inline-flex h-9 items-center gap-2 rounded-lg border border-text bg-text px-3 text-xs font-semibold text-bg disabled:opacity-45"
        :disabled="cameraBusy"
        data-testid="game-camera-start"
        @click="input.start()"
      >
        <AppIcon
          :name="cameraBusy ? 'loader' : 'camera'"
          :size="15"
          :class="cameraBusy ? 'animate-spin' : ''"
        />
        Use camera
      </button>
      <button
        v-else
        class="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 text-xs font-semibold hover:bg-surface-hover"
        data-testid="game-camera-stop"
        @click="input.stop()"
      >
        <AppIcon name="camera-off" :size="15" />
        Stop camera
      </button>
      <button
        class="inline-flex size-9 items-center justify-center rounded-lg border border-border hover:bg-surface-hover"
        :class="mouseMode ? 'bg-surface-hover' : 'bg-surface-raised'"
        title="Mouse fallback — hold: levitate (move the mouse = drift, wheel = hand distance, Space = stop) · Shift: circle · arrows/WASD: move · Alt: pinch (clump) · B: fist with the back to the camera (avatar mode) · release: drop"
        aria-label="Mouse fallback"
        data-testid="game-mouse"
        @click="mouseMode = !mouseMode"
      >
        <AppIcon name="mouse-pointer" :size="16" />
      </button>
      <button
        class="inline-flex size-9 items-center justify-center rounded-lg border border-border hover:bg-surface-hover"
        :class="avatarMode ? 'bg-surface-hover' : 'bg-surface-raised'"
        title="Avatar mode — your hand is shown as a small character; a fist with the back to the camera circles the balls around it. Switch it with this button or by performing the code: fist, point, two fingers, open palm"
        aria-label="Avatar mode"
        :aria-pressed="avatarMode"
        data-testid="game-avatar"
        @click="toggleAvatar"
      >
        <AppIcon name="user" :size="16" />
      </button>
    </div>

    <div
      class="absolute bottom-3 left-4 flex items-center gap-2 text-xs font-semibold text-text-secondary"
      data-testid="game-status"
    >
      <span
        class="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1"
        data-testid="game-mode"
      >
        <AppIcon :name="MODE_ICON[mode]" :size="13" />
        {{ mode }}
      </span>
      <span
        class="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1"
        data-testid="game-pose"
      >
        <AppIcon :name="POSE_ICON[pose]" :size="13" />
        {{ pose }}
      </span>
      <span
        v-if="stopping"
        class="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1"
        data-testid="game-stop"
      >
        <AppIcon name="stop" :size="13" />
        stop
      </span>
      <span
        v-if="avatarMode"
        class="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1"
        data-testid="game-avatar-pill"
      >
        <AppIcon name="user" :size="13" />
        avatar
      </span>
      <span
        v-if="codeProgress > 0"
        class="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1"
        data-testid="game-code"
      >
        <AppIcon name="key" :size="13" />
        {{ codeProgress }}/{{ gestureCode.length }}
      </span>
      <span
        v-if="input.error.value"
        class="inline-flex items-center gap-1.5 rounded-md bg-danger-bg px-2 py-1 text-danger"
        data-testid="game-error"
      >
        <AppIcon name="alert" :size="13" /> {{ input.error.value }}
      </span>
    </div>
  </div>
</template>
