<script setup lang="ts">
/**
 * One icon from ./icons.ts. Inherits the text colour (currentColor), so it follows the theme and hover states.
 * Decorative by default (aria-hidden). Pass `title` only when the icon is the ONLY content of its control and
 * the control has no aria-label of its own; otherwise label the button, not the icon.
 *
 *   <AppIcon name="plug" />                       16 px
 *   <AppIcon name="loader" :size="14" class="animate-spin" />
 */
import { computed } from 'vue'
import { ICONS, type IconName } from './icons'

const props = withDefaults(defineProps<{ name: IconName; size?: number; title?: string }>(), {
  size: 16,
  title: undefined,
})
const shapes = computed(() => ICONS[props.name])
</script>

<template>
  <svg
    class="shrink-0"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    focusable="false"
    :aria-hidden="title ? undefined : 'true'"
    :role="title ? 'img' : undefined"
    :aria-label="title"
    data-icon
    :data-icon-name="name"
  >
    <title v-if="title">{{ title }}</title>
    <component :is="shape[0]" v-for="(shape, i) in shapes" :key="i" v-bind="shape[1]" />
  </svg>
</template>
