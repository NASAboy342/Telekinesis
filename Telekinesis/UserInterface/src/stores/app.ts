import { ref } from 'vue'
import { defineStore } from 'pinia'
import { appApi, type AppVersionInfo } from '@/services/appApi'

export const useAppStore = defineStore('app', () => {
  const info = ref<AppVersionInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      info.value = await appApi.getVersion()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  return { info, loading, error, load }
})
