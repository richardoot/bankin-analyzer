<script setup lang="ts">
  import { computed } from 'vue'
  import { useRoute, useRouter } from 'vue-router'

  const route = useRoute()
  const router = useRouter()

  const imported = computed(() => parseInt(route.query.imported as string) || 0)
  const duplicates = computed(
    () => parseInt(route.query.duplicates as string) || 0
  )
  const total = computed(() => parseInt(route.query.total as string) || 0)
  const categories = computed(
    () => parseInt(route.query.categories as string) || 0
  )

  function goToImport() {
    router.push({ name: 'import' })
  }

  function goToProfile() {
    router.push({ name: 'profile' })
  }
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-12">
    <div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="bg-white rounded-xl shadow-sm p-8">
        <!-- Success icon -->
        <div class="flex justify-center mb-6">
          <div
            class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center"
          >
            <svg
              class="w-8 h-8 text-green-600"
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
          </div>
        </div>

        <!-- Title -->
        <h1 class="text-2xl font-bold text-gray-900 text-center mb-2">
          Import terminé
        </h1>
        <p class="text-gray-600 text-center mb-8">
          Voici le récapitulatif de votre import
        </p>

        <!-- Stats grid -->
        <div class="grid grid-cols-2 gap-4 mb-8">
          <!-- Transactions importées -->
          <div class="bg-green-50 rounded-xl p-6 text-center">
            <div class="text-4xl font-bold text-green-600 mb-1">
              {{ imported }}
            </div>
            <div class="text-sm font-medium text-green-800">
              Transactions importées
            </div>
          </div>

          <!-- Catégories -->
          <div class="bg-indigo-50 rounded-xl p-6 text-center">
            <div class="text-4xl font-bold text-indigo-600 mb-1">
              {{ categories }}
            </div>
            <div class="text-sm font-medium text-indigo-800">Catégories</div>
          </div>

          <!-- Doublons ignorés -->
          <div class="bg-amber-50 rounded-xl p-6 text-center">
            <div class="text-4xl font-bold text-amber-600 mb-1">
              {{ duplicates }}
            </div>
            <div class="text-sm font-medium text-amber-800">
              Doublons ignorés
            </div>
          </div>

          <!-- Total traité -->
          <div class="bg-gray-100 rounded-xl p-6 text-center">
            <div class="text-4xl font-bold text-gray-600 mb-1">
              {{ total }}
            </div>
            <div class="text-sm font-medium text-gray-700">Total traité</div>
          </div>
        </div>

        <!-- Info message -->
        <div
          v-if="duplicates > 0"
          class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8"
        >
          <div class="flex items-start">
            <svg
              class="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p class="text-sm text-blue-800">
              Les {{ duplicates }} transactions en doublon ont été
              automatiquement ignorées pour éviter les doublons dans votre
              historique.
            </p>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-4">
          <button
            @click="goToImport"
            class="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Nouvel import
          </button>
          <button
            @click="goToProfile"
            class="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            Retour au profil
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
