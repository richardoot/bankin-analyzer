<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'

  const router = useRouter()
  const route = useRoute()
  const authStore = useAuthStore()

  // Initialize signup mode from query param
  const isSignUp = ref(route.query.signup === 'true')
  const email = ref('')
  const password = ref('')
  const confirmPassword = ref('')
  const localError = ref<string | null>(null)

  const error = computed(() => localError.value || authStore.error)
  const loading = computed(() => authStore.loading)

  // Watch for query param changes
  onMounted(() => {
    if (route.query.signup === 'true') {
      isSignUp.value = true
    }
  })

  const toggleMode = (): void => {
    isSignUp.value = !isSignUp.value
    localError.value = null
    authStore.clearError()
  }

  const handleGoogleLogin = async (): Promise<void> => {
    localError.value = null
    authStore.clearError()
    try {
      await authStore.signInWithGoogle()
    } catch {
      // Error is handled by the store
    }
  }

  const handleSubmit = async (): Promise<void> => {
    localError.value = null
    authStore.clearError()

    if (!email.value || !password.value) {
      localError.value = 'Veuillez remplir tous les champs'
      return
    }

    if (isSignUp.value && password.value !== confirmPassword.value) {
      localError.value = 'Les mots de passe ne correspondent pas'
      return
    }

    if (password.value.length < 6) {
      localError.value = 'Le mot de passe doit contenir au moins 6 caracteres'
      return
    }

    try {
      if (isSignUp.value) {
        await authStore.signUp(email.value, password.value)
        // Redirect to email confirmation page
        await router.push({
          name: 'email-confirmation',
          query: { email: email.value },
        })
      } else {
        await authStore.signIn(email.value, password.value)
        const redirectPath = (route.query.redirect as string) || '/profile'
        await router.push(redirectPath)
      }
    } catch {
      // Error is handled by the store
    }
  }
</script>

<template>
  <div
    class="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gray-50 dark:bg-slate-800 px-4 transition-colors"
  >
    <div class="w-full max-w-md">
      <div
        class="rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-lg dark:shadow-slate-900/20"
      >
        <!-- Header -->
        <div class="mb-8 text-center">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {{ isSignUp ? 'Creer un compte' : 'Se connecter' }}
          </h1>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            {{
              isSignUp
                ? 'Rejoignez Finance Analyzer gratuitement'
                : 'Accedez a votre tableau de bord'
            }}
          </p>
        </div>

        <!-- Error message -->
        <div
          v-if="error"
          class="mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-400"
        >
          {{ error }}
        </div>

        <!-- Form -->
        <form class="space-y-6" @submit.prevent="handleSubmit">
          <div>
            <label
              for="email"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Email
            </label>
            <input
              id="email"
              v-model="email"
              type="email"
              required
              class="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-3 text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-800 placeholder-gray-500 dark:placeholder-gray-400 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:ring-emerald-400/20"
              placeholder="vous@exemple.com"
            />
          </div>

          <div>
            <label
              for="password"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Mot de passe
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              class="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-3 text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-800 placeholder-gray-500 dark:placeholder-gray-400 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:ring-emerald-400/20"
              placeholder="••••••••"
            />
          </div>

          <div v-if="isSignUp">
            <label
              for="confirmPassword"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Confirmer le mot de passe
            </label>
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              required
              class="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-3 text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-800 placeholder-gray-500 dark:placeholder-gray-400 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:ring-emerald-400/20"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-lg bg-emerald-500 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span v-if="loading">Chargement...</span>
            <span v-else>{{ isSignUp ? "S'inscrire" : 'Se connecter' }}</span>
          </button>
        </form>

        <!-- Separator -->
        <div class="relative mt-6">
          <div class="absolute inset-0 flex items-center">
            <div
              class="w-full border-t border-gray-300 dark:border-slate-600"
            ></div>
          </div>
          <div class="relative flex justify-center text-sm">
            <span
              class="bg-white dark:bg-slate-900 px-4 text-gray-500 dark:text-gray-400"
              >ou</span
            >
          </div>
        </div>

        <!-- Google Login -->
        <button
          type="button"
          :disabled="loading"
          class="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 text-base font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          @click="handleGoogleLogin"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continuer avec Google
        </button>

        <!-- Toggle mode -->
        <div class="mt-6 text-center">
          <button
            type="button"
            class="text-sm text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400"
            @click="toggleMode"
          >
            {{
              isSignUp
                ? 'Deja un compte ? Se connecter'
                : "Pas de compte ? S'inscrire"
            }}
          </button>
        </div>
      </div>

      <!-- Back to home -->
      <div class="mt-6 text-center">
        <RouterLink
          to="/"
          class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
        >
          &larr; Retour a l'accueil
        </RouterLink>
      </div>
    </div>
  </div>
</template>
