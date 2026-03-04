<script setup lang="ts">
  import { computed } from 'vue'
  import { useFiltersStore } from '@/stores/filters'

  const props = defineProps<{
    availableAccounts: string[]
    allExpenseCategories: string[]
    allIncomeCategories: string[]
  }>()

  const filtersStore = useFiltersStore()

  // Catégories de dépenses triées : non-masquées d'abord, masquées à la fin (alphabétique)
  const sortedExpenseCategories = computed(() => {
    const visible = props.allExpenseCategories
      .filter(cat => !filtersStore.isExpenseCategoryHidden(cat))
      .sort((a, b) => a.localeCompare(b, 'fr'))
    const hidden = props.allExpenseCategories
      .filter(cat => filtersStore.isExpenseCategoryHidden(cat))
      .sort((a, b) => a.localeCompare(b, 'fr'))
    return [...visible, ...hidden]
  })

  // Catégories de revenus triées : non-masquées d'abord, masquées à la fin (alphabétique)
  const sortedIncomeCategories = computed(() => {
    const visible = props.allIncomeCategories
      .filter(cat => !filtersStore.isIncomeCategoryHidden(cat))
      .sort((a, b) => a.localeCompare(b, 'fr'))
    const hidden = props.allIncomeCategories
      .filter(cat => filtersStore.isIncomeCategoryHidden(cat))
      .sort((a, b) => a.localeCompare(b, 'fr'))
    return [...visible, ...hidden]
  })
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm mb-8 overflow-hidden">
    <!-- Header cliquable -->
    <button
      class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      @click="filtersStore.togglePanelExpanded()"
    >
      <div class="flex items-center gap-3">
        <div class="p-2 bg-indigo-100 rounded-lg">
          <svg
            class="w-5 h-5 text-indigo-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
            />
          </svg>
        </div>
        <div class="text-left">
          <h2 class="text-lg font-semibold text-gray-900">Filtres avancés</h2>
          <p
            v-if="
              !filtersStore.isPanelExpanded &&
              filtersStore.activeFiltersCount > 0
            "
            class="text-sm text-indigo-600"
          >
            {{ filtersStore.activeFiltersCount }} filtre{{
              filtersStore.activeFiltersCount > 1 ? 's' : ''
            }}
            actif{{ filtersStore.activeFiltersCount > 1 ? 's' : '' }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Badge filtres actifs -->
        <span
          v-if="filtersStore.activeFiltersCount > 0"
          class="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-sm font-medium rounded-full"
        >
          {{ filtersStore.activeFiltersCount }}
        </span>

        <!-- Chevron -->
        <svg
          class="w-5 h-5 text-gray-400 transition-transform duration-200"
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
      <div class="px-6 pb-6 border-t border-gray-100 space-y-6">
        <!-- Section comptes joints -->
        <div class="pt-4">
          <div class="flex items-center gap-2 mb-3">
            <svg
              class="w-4 h-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h3 class="text-sm font-medium text-gray-700">Comptes joints</h3>
            <span class="text-xs text-gray-400">(montants ÷2)</span>
          </div>

          <div v-if="availableAccounts.length > 0" class="flex flex-wrap gap-2">
            <button
              v-for="account in availableAccounts"
              :key="account"
              class="group px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              :class="
                filtersStore.isJointAccount(account)
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:shadow-sm'
              "
              @click="filtersStore.toggleJointAccount(account)"
            >
              <span class="flex items-center gap-2">
                <svg
                  v-if="filtersStore.isJointAccount(account)"
                  class="w-4 h-4"
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
                {{ account }}
                <span
                  v-if="filtersStore.isJointAccount(account)"
                  class="text-indigo-200 font-normal"
                  >÷2</span
                >
              </span>
            </button>
          </div>

          <p
            v-else
            class="text-sm text-gray-500 italic bg-gray-50 rounded-lg p-4"
          >
            Aucun compte disponible. Importez des transactions pour voir vos
            comptes.
          </p>
        </div>

        <!-- Section catégories de dépenses masquées -->
        <div>
          <div class="flex items-center gap-2 mb-3">
            <svg
              class="w-4 h-4 text-red-500"
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
            <h3 class="text-sm font-medium text-gray-700">
              Catégories de dépenses masquées
            </h3>
            <span class="text-xs text-gray-400">(exclues des calculs)</span>
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
                  ? 'bg-red-600 text-white shadow-md shadow-red-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:shadow-sm'
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
            class="text-sm text-gray-500 italic bg-gray-50 rounded-lg p-4"
          >
            Aucune catégorie de dépenses disponible.
          </p>
        </div>

        <!-- Section catégories de revenus masquées -->
        <div>
          <div class="flex items-center gap-2 mb-3">
            <svg
              class="w-4 h-4 text-green-500"
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
            <h3 class="text-sm font-medium text-gray-700">
              Catégories de revenus masquées
            </h3>
            <span class="text-xs text-gray-400">(exclues des calculs)</span>
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
                  ? 'bg-red-600 text-white shadow-md shadow-red-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:shadow-sm'
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
            class="text-sm text-gray-500 italic bg-gray-50 rounded-lg p-4"
          >
            Aucune catégorie de revenus disponible.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
