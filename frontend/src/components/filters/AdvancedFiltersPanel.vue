<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useFiltersStore } from '@/stores/filters'
  import { useAuthStore } from '@/stores/auth'

  const props = defineProps<{
    allExpenseCategories: string[]
    allIncomeCategories: string[]
  }>()

  const filtersStore = useFiltersStore()
  const authStore = useAuthStore()

  // État de sauvegarde
  const saveSuccess = ref(false)

  // Sauvegarder les préférences
  async function handleSave(event: Event) {
    event.stopPropagation() // Empêcher le toggle du panneau
    const success = await filtersStore.saveToBackend()
    if (success) {
      saveSuccess.value = true
      setTimeout(() => {
        saveSuccess.value = false
      }, 2000)
    }
  }

  // Catégories de dépenses triées : exclut les catégories masquées globalement,
  // puis non-masquées d'abord, masquées (dashboard) à la fin (alphabétique)
  const sortedExpenseCategories = computed(() => {
    // Exclure les catégories masquées globalement (elles ne doivent pas apparaître du tout)
    const availableCategories = props.allExpenseCategories.filter(
      cat => !filtersStore.isExpenseCategoryGloballyHidden(cat)
    )
    const visible = availableCategories
      .filter(cat => !filtersStore.isExpenseCategoryHidden(cat))
      .sort((a, b) => a.localeCompare(b, 'fr'))
    const hidden = availableCategories
      .filter(cat => filtersStore.isExpenseCategoryHidden(cat))
      .sort((a, b) => a.localeCompare(b, 'fr'))
    return [...visible, ...hidden]
  })

  // Catégories de revenus triées : exclut les catégories masquées globalement,
  // puis non-masquées d'abord, masquées (dashboard) à la fin (alphabétique)
  const sortedIncomeCategories = computed(() => {
    // Exclure les catégories masquées globalement (elles ne doivent pas apparaître du tout)
    const availableCategories = props.allIncomeCategories.filter(
      cat => !filtersStore.isIncomeCategoryGloballyHidden(cat)
    )
    const visible = availableCategories
      .filter(cat => !filtersStore.isIncomeCategoryHidden(cat))
      .sort((a, b) => a.localeCompare(b, 'fr'))
    const hidden = availableCategories
      .filter(cat => filtersStore.isIncomeCategoryHidden(cat))
      .sort((a, b) => a.localeCompare(b, 'fr'))
    return [...visible, ...hidden]
  })
</script>

<template>
  <div
    class="bg-white dark:bg-slate-900 rounded-xl mb-6 overflow-hidden transition-shadow"
    :class="
      filtersStore.isPanelExpanded
        ? 'shadow-sm dark:shadow-slate-900/20 border border-gray-200 dark:border-slate-700'
        : 'border border-gray-200 dark:border-slate-700'
    "
  >
    <!-- Header cliquable -->
    <button
      class="w-full flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
      :class="filtersStore.isPanelExpanded ? 'px-5 py-3.5' : 'px-4 py-2.5'"
      @click="filtersStore.togglePanelExpanded()"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <svg
          class="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Filtres avancés
        </span>
        <span
          v-if="filtersStore.activeFiltersCount > 0"
          class="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-medium rounded-full tabular-nums"
        >
          {{ filtersStore.activeFiltersCount }} actif{{
            filtersStore.activeFiltersCount > 1 ? 's' : ''
          }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Bouton Enregistrer (visible si authentifié et modifications non sauvegardées) -->
        <button
          v-if="authStore.isAuthenticated && filtersStore.hasUnsavedChanges"
          class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-150"
          :class="
            filtersStore.isSyncing
              ? 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500 cursor-wait'
              : saveSuccess
                ? 'bg-green-500 text-white'
                : 'bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-600'
          "
          :disabled="filtersStore.isSyncing"
          @click="handleSave"
        >
          <!-- Icône loading -->
          <svg
            v-if="filtersStore.isSyncing"
            class="w-3.5 h-3.5 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <!-- Icône succès -->
          <svg
            v-else-if="saveSuccess"
            class="w-3.5 h-3.5"
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
          <!-- Icône sauvegarde -->
          <svg
            v-else
            class="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            />
          </svg>
          <span v-if="saveSuccess">Enregistré</span>
          <span v-else-if="!filtersStore.isSyncing">Enregistrer</span>
        </button>

        <!-- Chevron -->
        <svg
          class="w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200"
          :class="{ 'rotate-180': filtersStore.isPanelExpanded }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </button>

    <!-- Contenu collapsible -->
    <div
      class="transition-all duration-200 ease-in-out"
      :class="
        filtersStore.isPanelExpanded
          ? 'max-h-[800px] opacity-100'
          : 'max-h-0 opacity-0 overflow-hidden'
      "
    >
      <div
        class="px-5 pt-4 pb-5 border-t border-gray-100 dark:border-slate-700 space-y-5"
      >
        <!-- Section catégories de dépenses masquées -->
        <div>
          <div class="flex items-center gap-2 mb-3">
            <svg
              class="w-4 h-4 text-red-500 dark:text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            </svg>
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Catégories de dépenses masquées
            </h3>
            <span class="text-xs text-gray-400 dark:text-gray-500"
              >(exclues des calculs)</span
            >
          </div>

          <div
            v-if="sortedExpenseCategories.length > 0"
            class="flex flex-wrap gap-2"
          >
            <button
              v-for="category in sortedExpenseCategories"
              :key="category"
              class="group px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              :class="
                filtersStore.isExpenseCategoryHidden(category)
                  ? 'bg-red-600 dark:bg-red-500 text-white shadow-md shadow-red-200 dark:shadow-red-900/30'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 hover:shadow-sm'
              "
              @click="filtersStore.toggleHiddenExpenseCategory(category)"
            >
              <span class="flex items-center gap-2">
                <svg
                  v-if="filtersStore.isExpenseCategoryHidden(category)"
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                  />
                </svg>
                {{ category }}
              </span>
            </button>
          </div>

          <p
            v-else
            class="text-sm text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-slate-800 rounded-lg p-4"
          >
            Aucune catégorie de dépenses disponible.
          </p>
        </div>

        <!-- Section catégories de revenus masquées -->
        <div>
          <div class="flex items-center gap-2 mb-3">
            <svg
              class="w-4 h-4 text-green-500 dark:text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            </svg>
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Catégories de revenus masquées
            </h3>
            <span class="text-xs text-gray-400 dark:text-gray-500"
              >(exclues des calculs)</span
            >
          </div>

          <div
            v-if="sortedIncomeCategories.length > 0"
            class="flex flex-wrap gap-2"
          >
            <button
              v-for="category in sortedIncomeCategories"
              :key="category"
              class="group px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              :class="
                filtersStore.isIncomeCategoryHidden(category)
                  ? 'bg-red-600 dark:bg-red-500 text-white shadow-md shadow-red-200 dark:shadow-red-900/30'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 hover:shadow-sm'
              "
              @click="filtersStore.toggleHiddenIncomeCategory(category)"
            >
              <span class="flex items-center gap-2">
                <svg
                  v-if="filtersStore.isIncomeCategoryHidden(category)"
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                  />
                </svg>
                {{ category }}
              </span>
            </button>
          </div>

          <p
            v-else
            class="text-sm text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-slate-800 rounded-lg p-4"
          >
            Aucune catégorie de revenus disponible.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
