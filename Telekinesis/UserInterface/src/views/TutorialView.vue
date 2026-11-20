<script setup lang="ts">
// The tutorial is the free swarm (like /play) with a guide card on top (a separate component, so every visit starts at step 1).
import GameView from './GameView.vue'
</script>

<template>
  <GameView :tutorial-on="true" />
</template>
