<script setup lang="ts">
  import { formatCurrency } from '@/lib/formatters'

  defineProps<{
    currentSavings: number
    targetSavings: number
    potentialGain: number
    savingsProgressPercent: number
  }>()
</script>

<template>
  <div
    class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6"
  >
    <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">
      Resume Epargne
    </h2>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <!-- Current savings card -->
      <div
        class="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border-l-4 border-gray-400 dark:border-gray-600"
      >
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">
          Epargne actuelle
        </p>
        <p
          class="text-2xl font-bold"
          :class="
            currentSavings >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          "
        >
          {{ formatCurrency(currentSavings) }}
        </p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
          revenus - depenses
        </p>
      </div>

      <!-- Target savings card -->
      <div
        class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border-l-4 border-indigo-500"
      >
        <p class="text-sm text-indigo-600 dark:text-indigo-400 mb-1">
          Epargne cible
        </p>
        <p class="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
          {{ formatCurrency(targetSavings) }}
        </p>
        <p class="text-xs text-indigo-400 dark:text-indigo-500 mt-1">
          revenus - budget
        </p>
      </div>

      <!-- Potential gain card -->
      <div
        class="rounded-lg p-4 border-l-4"
        :class="
          potentialGain >= 0
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500'
            : 'bg-red-50 dark:bg-red-900/20 border-red-500'
        "
      >
        <p
          class="text-sm mb-1"
          :class="
            potentialGain >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          "
        >
          Gain potentiel
        </p>
        <p
          class="text-2xl font-bold"
          :class="
            potentialGain >= 0
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-red-700 dark:text-red-300'
          "
        >
          {{ potentialGain >= 0 ? '+' : '' }}{{ formatCurrency(potentialGain) }}
        </p>
        <p
          class="text-xs mt-1"
          :class="
            potentialGain >= 0
              ? 'text-emerald-400 dark:text-emerald-500'
              : 'text-red-400 dark:text-red-500'
          "
        >
          cible - actuelle
        </p>
      </div>
    </div>

    <!-- Progress bar toward target -->
    <div
      v-if="targetSavings > 0"
      class="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700"
    >
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-gray-600 dark:text-gray-400"
          >Progression vers objectif</span
        >
        <span
          class="text-sm font-medium"
          :class="
            savingsProgressPercent >= 100
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-indigo-600 dark:text-indigo-400'
          "
        >
          {{ Math.round(savingsProgressPercent) }}%
        </span>
      </div>
      <div class="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-3">
        <div
          class="h-3 rounded-full transition-all duration-500"
          :class="
            savingsProgressPercent >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'
          "
          :style="{
            width: `${Math.min(savingsProgressPercent, 100)}%`,
          }"
        />
      </div>
    </div>
  </div>
</template>
