<script setup lang="ts">
// The game's mark: a heap of balls on the floor line, four of them lifted off it. Outline only, drawn in
// currentColor so it follows the theme. Same drawing as public/favicon.svg and AppIcon/* (decorative, not a control).
const BALLS: [number, number][] = [
  [16.5, 52],
  [24, 52],
  [32, 52],
  [40, 52],
  [47.5, 52],
  [20.2, 45],
  [28, 45],
  [36, 45],
  [43.8, 45],
  [24, 38],
  [32, 38],
  [40, 38],
  [32, 25],
  [25, 17.5],
  [39, 17.5],
  [32, 10.5],
]

withDefaults(defineProps<{ size?: number }>(), { size: 64 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linecap="round"
    role="img"
    aria-label="Telekinesis logo"
    data-testid="app-logo"
  >
    <circle v-for="(p, i) in BALLS" :key="i" :cx="p[0]" :cy="p[1]" r="3" />
    <path d="M10 56h44" />
  </svg>
</template>
