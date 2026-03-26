import { ref } from 'vue'

export function useAsyncAction() {
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function run<T>(
    action: () => Promise<T>,
    errorMessage: string
  ): Promise<T | null> {
    try {
      isLoading.value = true
      error.value = null
      return await action()
    } catch (err) {
      error.value = err instanceof Error ? err.message : errorMessage
      console.error(`${errorMessage}:`, err)
      return null
    } finally {
      isLoading.value = false
    }
  }

  function clearError(): void {
    error.value = null
  }

  return { isLoading, error, run, clearError }
}
