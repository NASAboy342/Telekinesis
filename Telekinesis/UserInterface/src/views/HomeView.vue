<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/icons/AppIcon.vue'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
onMounted(() => app.load())
</script>

<template>
  <main class="flex h-full flex-col items-center justify-center gap-4 p-8" data-testid="home-view">
    <h1 class="flex items-center gap-2 text-3xl font-bold tracking-tight">
      <AppIcon name="circle" :size="28" />
      Telekinesis
    </h1>
    <p class="text-muted">Control a swarm with your hands.</p>
    <p
      class="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1 text-xs font-semibold text-text-secondary"
      data-testid="version-pill"
    >
      <AppIcon
        :name="app.error ? 'alert' : app.loading ? 'loader' : 'check-circle'"
        :size="13"
        :class="app.loading ? 'animate-spin' : ''"
      />
      <template v-if="app.error">{{ app.error }}</template>
      <template v-else-if="app.info">v{{ app.info.version }}</template>
      <template v-else>…</template>
    </p>
    <button
      class="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface-raised text-text hover:bg-surface-hover"
      title="Reload version"
      aria-label="Reload version"
      data-testid="reload-version"
      :disabled="app.loading"
      @click="app.load()"
    >
      <AppIcon name="refresh" :size="16" />
    </button>
    <RouterLink
      to="/play"
      class="inline-flex h-9 items-center gap-2 rounded-lg border border-text bg-text px-3 text-xs font-semibold text-bg"
      data-testid="open-play"
    >
      <AppIcon name="play" :size="15" />
      Play
    </RouterLink>
    <RouterLink
      to="/spike"
      class="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 text-xs font-semibold hover:bg-surface-hover"
      data-testid="open-spike"
    >
      <AppIcon name="hand" :size="15" />
      Camera spike
    </RouterLink>
  </main>
</template>
