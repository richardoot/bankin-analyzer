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
      dbUser.value = await api.getMe()
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

      if (data.session) {
        await syncWithBackend()
      }
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Failed to initialize auth'
    } finally {
      loading.value = false
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

  async function signInWithGoogle(): Promise<void> {
    try {
      loading.value = true
      error.value = null
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/profile`,
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
