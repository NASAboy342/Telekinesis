<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/icons/AppIcon.vue'
import { useHandInput } from '@/composables/useHandInput'
import { HAND_CONNECTIONS, type NormalizedLandmark } from '@/helpers/handTracker'
import type { Pose } from '@/helpers/gestures'
import type { IconName } from '@/components/icons/icons'

const input = useHandInput('spike')
const { phase, error, delegate, fps, signals, landmarks } = input
const canvas = ref<HTMLCanvasElement | null>(null)
const hands = computed(() => signals.value.length)
const POSE_ICON: Record<Pose, IconName> = {
  none: 'circle',
  open: 'hand',
  fist: 'circle-dot',
  point: 'arrow-up',
  two: 'fingers-two',
  pinch: 'crosshair',
}

watch(landmarks, (all) => {
  const c = canvas.value
  if (!c) return
  if (c.width !== c.clientWidth || c.height !== c.clientHeight) {
    c.width = c.clientWidth
    c.height = c.clientHeight
  }
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, c.width, c.height)
  for (const hand of all) drawHand(ctx, hand, c.width, c.height)
})
watch(phase, (p) => {
  if (p !== 'running')
    canvas.value?.getContext('2d')?.clearRect(0, 0, canvas.value.width, canvas.value.height)
})

// Mirrored: moving your right hand to the right moves it right on screen.
function drawHand(ctx: CanvasRenderingContext2D, lm: NormalizedLandmark[], w: number, h: number) {
  const pt = (p: NormalizedLandmark) => [(1 - p.x) * w, p.y * h] as const
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 2
  ctx.fillStyle = '#fff'
  for (const { start, end } of HAND_CONNECTIONS) {
    const [x1, y1] = pt(lm[start]!)
    const [x2, y2] = pt(lm[end]!)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  for (const p of lm) {
    const [x, y] = pt(p)
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}
</script>

<template>
  <div class="relative h-full w-full overflow-hidden" data-testid="spike-view">
    <canvas ref="canvas" class="absolute inset-0 h-full w-full" data-testid="spike-canvas" />

    <div class="absolute left-4 top-4 flex items-center gap-2">
      <RouterLink
        to="/"
        class="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface-raised text-text hover:bg-surface-hover"
        title="Back"
        aria-label="Back"
        data-testid="spike-back"
      >
        <AppIcon name="arrow-left" :size="16" />
      </RouterLink>
      <button
        v-if="phase !== 'running'"
        class="inline-flex h-9 items-center gap-2 rounded-lg border border-text bg-text px-3 text-xs font-semibold text-bg disabled:opacity-45"
        :disabled="phase === 'starting'"
        data-testid="spike-start"
        @click="input.start()"
      >
        <AppIcon
          :name="phase === 'starting' ? 'loader' : 'camera'"
          :size="15"
          :class="phase === 'starting' ? 'animate-spin' : ''"
        />
        Start camera
      </button>
      <button
        v-else
        class="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 text-xs font-semibold hover:bg-surface-hover"
        data-testid="spike-stop"
        @click="input.stop()"
      >
        <AppIcon name="camera-off" :size="15" />
        Stop
      </button>
    </div>

    <div class="absolute right-4 top-4 flex flex-col gap-2" data-testid="spike-signals">
      <div
        v-for="h in signals"
        :key="h.side"
        class="w-56 rounded-xl border border-border bg-surface p-3 text-xs"
        :data-testid="`signal-${h.side}`"
      >
        <div class="mb-2 flex items-center justify-between font-semibold">
          <span class="inline-flex items-center gap-1.5"
            ><AppIcon :name="POSE_ICON[h.pose]" :size="14" /> {{ h.pose }}</span
          >
          <span class="text-muted">{{ h.side }}</span>
        </div>
        <div class="mb-1 flex items-center gap-2 text-text-secondary">
          <AppIcon name="crosshair" :size="12" />
          <div class="h-1.5 flex-1 rounded-full bg-surface-muted">
            <div
              class="h-full rounded-full bg-text"
              :style="{ width: `${Math.round(h.pinchAmount * 100)}%` }"
            />
          </div>
        </div>
        <div class="mb-1 flex items-center gap-2 text-text-secondary">
          <AppIcon name="hand" :size="12" />
          <div class="h-1.5 flex-1 rounded-full bg-surface-muted">
            <div
              class="h-full rounded-full bg-text"
              :style="{ width: `${Math.round(h.openness * 100)}%` }"
            />
          </div>
        </div>
        <div
          class="mb-1 flex items-center justify-between text-text-secondary"
          :data-testid="`facing-${h.side}`"
        >
          <span class="inline-flex items-center gap-1.5 font-semibold">
            <AppIcon name="eye" :size="12" /> {{ h.facing.state }}
          </span>
          <span class="text-muted">
            w {{ h.facing.winding.toFixed(2) }} · d {{ h.facing.depth.toFixed(2) }}
          </span>
        </div>
        <div class="flex items-center justify-between text-muted">
          <span class="inline-flex items-center gap-1"
            ><AppIcon name="zap" :size="12" /> {{ h.speed.toFixed(2) }}</span
          >
          <span class="inline-flex items-center gap-1" title="hand size on screen (bigger = closer)"
            ><AppIcon name="target" :size="12" /> {{ h.size.toFixed(2) }}</span
          >
          <span class="inline-flex items-center gap-1"
            ><AppIcon name="move-horizontal" :size="12" /> {{ h.palm.x.toFixed(2) }},
            {{ h.palm.y.toFixed(2) }}</span
          >
        </div>
      </div>
    </div>

    <div
      class="absolute bottom-4 left-4 flex items-center gap-2 text-xs font-semibold text-text-secondary"
      data-testid="spike-status"
    >
      <span class="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1">
        <AppIcon
          :name="phase === 'error' ? 'alert' : phase === 'running' ? 'activity' : 'power'"
          :size="13"
        />
        {{ phase }}
      </span>
      <span
        v-if="phase === 'running'"
        class="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1"
        data-testid="spike-hands"
      >
        <AppIcon name="hand" :size="13" /> {{ hands }}
      </span>
      <span
        v-if="phase === 'running'"
        class="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1"
      >
        <AppIcon name="cpu" :size="13" /> {{ delegate }} · {{ fps }} fps
      </span>
      <span
        v-if="error"
        class="inline-flex items-center gap-1.5 rounded-md bg-danger-bg px-2 py-1 text-danger"
        data-testid="spike-error"
      >
        <AppIcon name="alert" :size="13" /> {{ error }}
      </span>
    </div>
  </div>
</template>
