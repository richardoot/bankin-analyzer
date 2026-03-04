<script setup lang="ts">
  import { useFiltersStore } from '@/stores/filters'

  defineProps<{
    availableAccounts: string[]
  }>()

  const filtersStore = useFiltersStore()
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
          ? 'max-h-96 opacity-100'
          : 'max-h-0 opacity-0 overflow-hidden'
      "
    >
      <div class="px-6 pb-6 border-t border-gray-100">
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
      </div>
    </div>
  </div>
</template>
