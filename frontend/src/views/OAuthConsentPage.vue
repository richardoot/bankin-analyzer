<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { supabase } from '@/lib/supabase'

  const route = useRoute()
  const router = useRouter()

  const isLoading = ref(true)
  const error = ref<string | null>(null)
  const isSubmitting = ref(false)
  const clientName = ref('')
  const scopes = ref<string[]>([])
  const authorizationId = ref('')

  onMounted(async () => {
    const id = route.query.authorization_id as string

    if (!id) {
      error.value = 'Parametre authorization_id manquant'
      isLoading.value = false
      return
    }

    authorizationId.value = id

    try {
      const { data, error: fetchError } =
        await supabase.auth.oauth.getAuthorizationDetails(id)

      if (fetchError || !data) {
        error.value =
          fetchError?.message ??
          "Impossible de recuperer les details d'autorisation"
        return
      }

      clientName.value = data.client?.name ?? 'Application inconnue'
      scopes.value = data.scope?.split(' ').filter(Boolean) ?? []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Erreur inattendue'
    } finally {
      isLoading.value = false
    }
  })

  async function approve(): Promise<void> {
    try {
      isSubmitting.value = true
      const { error: approveError } =
        await supabase.auth.oauth.approveAuthorization(authorizationId.value)

      if (approveError) {
        error.value = approveError.message
      }
      // GoTrue redirige automatiquement apres l'approbation
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Erreur lors de l'approbation"
      isSubmitting.value = false
    }
  }

  async function deny(): Promise<void> {
    try {
      isSubmitting.value = true
      await supabase.auth.oauth.denyAuthorization(authorizationId.value)
      router.push('/')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Erreur lors du refus'
      isSubmitting.value = false
    }
  }
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-800 px-4"
  >
    <div
      class="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl dark:shadow-slate-900/40 overflow-hidden"
    >
      <!-- Header -->
      <div class="px-8 pt-8 pb-4 text-center">
        <div
          class="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <svg
            class="w-8 h-8 text-indigo-600 dark:text-indigo-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <h1 class="text-xl font-semibold text-gray-900 dark:text-white">
          Demande d'autorisation
        </h1>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="px-8 py-12 text-center">
        <div
          class="w-8 h-8 border-3 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin mx-auto"
        />
        <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Chargement...
        </p>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="px-8 pb-8">
        <div
          class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-center"
        >
          <p class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
        </div>
        <button
          class="w-full mt-4 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-xl transition-colors"
          @click="router.push('/')"
        >
          Retour
        </button>
      </div>

      <!-- Consent form -->
      <div v-else class="px-8 pb-8">
        <div class="bg-gray-50 dark:bg-slate-800 rounded-xl p-5 mb-6">
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
            L'application
          </p>
          <p class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ clientName }}
          </p>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-3">
            souhaite acceder a votre compte avec les permissions suivantes :
          </p>
        </div>

        <!-- Scopes -->
        <div class="space-y-2 mb-6">
          <div
            v-for="scope in scopes"
            :key="scope"
            class="flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800 rounded-lg"
          >
            <svg
              class="w-5 h-5 text-emerald-500 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span class="text-sm text-gray-700 dark:text-gray-300">{{
              scope
            }}</span>
          </div>
          <div
            v-if="scopes.length === 0"
            class="flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800 rounded-lg"
          >
            <svg
              class="w-5 h-5 text-emerald-500 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            <span class="text-sm text-gray-700 dark:text-gray-300"
              >Lecture seule de vos donnees financieres</span
            >
          </div>
        </div>

        <!-- Warning -->
        <div
          class="flex items-start gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 rounded-lg mb-6"
        >
          <svg
            class="w-5 h-5 text-amber-500 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <p class="text-xs text-amber-700 dark:text-amber-400">
            Cette application pourra consulter vos transactions, categories,
            budgets et statistiques. Elle ne pourra pas modifier vos donnees.
          </p>
        </div>

        <!-- Buttons -->
        <div class="flex gap-3">
          <button
            :disabled="isSubmitting"
            class="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-xl transition-colors disabled:opacity-50"
            @click="deny"
          >
            Refuser
          </button>
          <button
            :disabled="isSubmitting"
            class="flex-1 px-4 py-3 text-sm font-medium text-white bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 rounded-xl transition-colors disabled:opacity-50"
            @click="approve"
          >
            <span v-if="isSubmitting">Autorisation...</span>
            <span v-else>Autoriser</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
