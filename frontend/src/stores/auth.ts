import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const session = ref<Session | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!user.value)

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
      loading.value = false
    }

    supabase.auth.onAuthStateChange((_event, newSession) => {
      session.value = newSession
      user.value = newSession?.user ?? null
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

  function clearError(): void {
    error.value = null
  }

  return {
    user,
    session,
    loading,
    error,
    isAuthenticated,
    initialize,
    signIn,
    signUp,
    signOut,
    clearError,
  }
})
