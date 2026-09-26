import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'
import type { DbUser } from '@/lib/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const session = ref<Session | null>(null)
  const dbUser = ref<DbUser | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!user.value)

  async function syncWithBackend(): Promise<void> {
    if (!session.value?.access_token) {
      dbUser.value = null
      return
    }

    try {
      // Import dynamique pour éviter la dépendance circulaire
      const { useFiltersStore } = await import('./filters')
      const filtersStore = useFiltersStore()
      // Two independent answers, asked for at once. The preferences load
      // never throws; a failed profile is the only thing that lands below.
      const [me] = await Promise.all([
        api.getMe(),
        filtersStore.loadFromBackend(),
      ])
      dbUser.value = me
    } catch (err) {
      console.error('Failed to sync with backend:', err)
      dbUser.value = null
    }
  }

  async function initialize(): Promise<void> {
    try {
      loading.value = true
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      user.value = data.session?.user ?? null
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Failed to initialize auth'
    } finally {
      // The session alone decides what the router may show. The app's own
      // user row and the filter preferences follow in the background: no
      // screen reads them synchronously, and holding the first paint for
      // two more round-trips is what they used to cost.
      loading.value = false
    }

    if (session.value) {
      void syncWithBackend()
    }

    supabase.auth.onAuthStateChange(async (_event, newSession) => {
      session.value = newSession
      user.value = newSession?.user ?? null

      if (newSession) {
        await syncWithBackend()
      } else {
        dbUser.value = null
      }
    })

    // Refresh session when tab becomes visible again after inactivity
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && session.value) {
        try {
          const { data, error: refreshError } =
            await supabase.auth.refreshSession()
          if (!refreshError && data.session) {
            session.value = data.session
            user.value = data.session.user
            // Re-sync with backend to ensure data is fresh
            await syncWithBackend()
          } else if (refreshError) {
            // Session is truly expired, clear local state
            console.warn('Session expired, please log in again')
            session.value = null
            user.value = null
            dbUser.value = null
          }
        } catch (err) {
          // Silently handle - session might just need a page refresh
          console.debug('Session refresh on visibility change:', err)
        }
      }
    })
  }

  async function signIn(email: string, password: string): Promise<void> {
    try {
      loading.value = true
      error.value = null
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        throw signInError
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to sign in'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function signUp(email: string, password: string): Promise<void> {
    try {
      loading.value = true
      error.value = null
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })
      if (signUpError) {
        throw signUpError
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to sign up'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function signOut(): Promise<void> {
    try {
      loading.value = true
      error.value = null
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) {
        throw signOutError
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to sign out'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function signInWithGoogle(redirectPath?: string): Promise<void> {
    try {
      loading.value = true
      error.value = null
      const target = redirectPath?.startsWith('/') ? redirectPath : '/dashboard'
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${target}`,
        },
      })
      if (oauthError) {
        throw oauthError
      }
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Failed to sign in with Google'
      throw err
    } finally {
      loading.value = false
    }
  }

  function clearError(): void {
    error.value = null
  }

  async function deleteAccount(): Promise<void> {
    try {
      loading.value = true
      error.value = null

      await api.deleteAccount()
      await supabase.auth.signOut()

      dbUser.value = null
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Failed to delete account'
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    user,
    session,
    dbUser,
    loading,
    error,
    isAuthenticated,
    initialize,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    clearError,
    syncWithBackend,
    deleteAccount,
  }
})
