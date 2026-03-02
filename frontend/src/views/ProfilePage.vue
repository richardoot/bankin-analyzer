<script setup lang="ts">
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'

  const router = useRouter()
  const authStore = useAuthStore()

  const user = computed(() => authStore.user)
  const loading = computed(() => authStore.loading)

  const createdAt = computed(() => {
    if (!user.value?.created_at) {
      return null
    }
    return new Date(user.value.created_at).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  })

  const handleSignOut = async (): Promise<void> => {
    await authStore.signOut()
    await router.push('/')
  }
</script>

<template>
  <div class="min-h-[calc(100vh-4rem)] bg-gray-50 py-12">
    <div class="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
      <!-- Profile Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900">Mon Profil</h1>
        <p class="mt-2 text-gray-600">Gerez vos informations personnelles</p>
      </div>

      <!-- Profile Card -->
      <div class="rounded-2xl bg-white p-8 shadow-lg">
        <!-- Avatar and Name -->
        <div class="flex items-center gap-6 border-b border-gray-200 pb-8">
          <div
            class="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-600"
          >
            {{ user?.email?.charAt(0).toUpperCase() || '?' }}
          </div>
          <div>
            <h2 class="text-xl font-semibold text-gray-900">
              {{ user?.email || 'Utilisateur' }}
            </h2>
            <p class="text-gray-600">Membre Finance Analyzer</p>
          </div>
        </div>

        <!-- Profile Info -->
        <div class="space-y-6 py-8">
          <div>
            <label class="block text-sm font-medium text-gray-500">
              Adresse email
            </label>
            <p class="mt-1 text-lg text-gray-900">{{ user?.email }}</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-500">
              Identifiant unique
            </label>
            <p class="mt-1 font-mono text-sm text-gray-600">{{ user?.id }}</p>
          </div>

          <div v-if="createdAt">
            <label class="block text-sm font-medium text-gray-500">
              Membre depuis
            </label>
            <p class="mt-1 text-lg text-gray-900">{{ createdAt }}</p>
          </div>

          <div v-if="user?.email_confirmed_at">
            <label class="block text-sm font-medium text-gray-500">
              Statut du compte
            </label>
            <p class="mt-1 flex items-center gap-2 text-lg text-gray-900">
              <span
                class="inline-flex h-2 w-2 rounded-full bg-emerald-500"
              ></span>
              Email verifie
            </p>
          </div>
        </div>

        <!-- Actions -->
        <div class="border-t border-gray-200 pt-8">
          <button
            type="button"
            :disabled="loading"
            class="rounded-lg border border-red-300 px-6 py-3 text-base font-medium text-red-700 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            @click="handleSignOut"
          >
            <span v-if="loading">Deconnexion...</span>
            <span v-else>Se deconnecter</span>
          </button>
        </div>
      </div>

      <!-- Quick Links -->
      <div class="mt-8 rounded-2xl bg-white p-8 shadow-lg">
        <h3 class="mb-4 text-lg font-semibold text-gray-900">Acces rapide</h3>
        <div class="grid gap-4 sm:grid-cols-2">
          <RouterLink
            to="/"
            class="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50"
          >
            <div
              class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100"
            >
              <svg
                class="h-5 w-5 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
            </div>
            <div>
              <p class="font-medium text-gray-900">Accueil</p>
              <p class="text-sm text-gray-600">Retour a la page d'accueil</p>
            </div>
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
