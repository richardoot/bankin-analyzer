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
    class="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gray-50 px-4"
  >
    <div class="w-full max-w-md">
      <div class="rounded-2xl bg-white p-8 shadow-lg">
        <!-- Header -->
        <div class="mb-8 text-center">
          <h1 class="text-2xl font-bold text-gray-900">
            {{ isSignUp ? 'Creer un compte' : 'Se connecter' }}
          </h1>
          <p class="mt-2 text-gray-600">
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
          class="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700"
        >
          {{ error }}
        </div>

        <!-- Form -->
        <form class="space-y-6" @submit.prevent="handleSubmit">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              v-model="email"
              type="email"
              required
              class="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="vous@exemple.com"
            />
          </div>

          <div>
            <label
              for="password"
              class="block text-sm font-medium text-gray-700"
            >
              Mot de passe
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              class="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="••••••••"
            />
          </div>

          <div v-if="isSignUp">
            <label
              for="confirmPassword"
              class="block text-sm font-medium text-gray-700"
            >
              Confirmer le mot de passe
            </label>
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              required
              class="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-lg bg-emerald-500 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span v-if="loading">Chargement...</span>
            <span v-else>{{ isSignUp ? "S'inscrire" : 'Se connecter' }}</span>
          </button>
        </form>

        <!-- Toggle mode -->
        <div class="mt-6 text-center">
          <button
            type="button"
            class="text-sm text-emerald-600 hover:text-emerald-700"
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
        <RouterLink to="/" class="text-sm text-gray-600 hover:text-gray-900">
          &larr; Retour a l'accueil
        </RouterLink>
      </div>
    </div>
  </div>
</template>
