import { ref } from 'vue'
import * as Sentry from '@sentry/vue'
import { useToast } from './useToast'

export function useAsyncAction() {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const toast = useToast()

  async function run<T>(
    action: () => Promise<T>,
    errorMessage: string
  ): Promise<T | null> {
    try {
      isLoading.value = true
      error.value = null
      return await action()
    } catch (err) {
      const message = err instanceof Error ? err.message : errorMessage
      error.value = message
      toast.error(message)
      // The toast is all the user sees; without this the error would be
      // gone with it. A session problem is the login flow's business and
      // not a defect, so it stays out.
      if (!(err instanceof Error && err.name === 'AuthError')) {
        Sentry.captureException(err)
      }
      return null
    } finally {
      isLoading.value = false
    }
  }

  function clearError(): void {
    error.value = null
  }

  return { isLoading, error, run, clearError, toast }
}
