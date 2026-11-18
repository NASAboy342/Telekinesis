<script setup lang="ts">
// The Arena is the game view with its props, goals, score and sound switched on (a separate component, so moving
// between /play and /arena always starts a fresh stage). `/#/arena?stage=3` opens straight at stage 3.
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import GameView from './GameView.vue'

const route = useRoute()
const startStage = computed(() => {
  const n = Number(route.query.stage)
  return Number.isInteger(n) && n >= 1 ? n - 1 : 0
})
</script>

<template>
  <GameView :arena-on="true" :start-stage="startStage" />
</template>
