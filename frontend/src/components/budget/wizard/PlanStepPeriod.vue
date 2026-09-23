<script setup lang="ts">
  /**
   * Étape 1 — la période et le nom. Les mois et le nom sont des
   * v-model ; le choix d'un preset remonte au parent, qui sait quels
   * mois il implique.
   */
  export type Preset = 'next-month' | 'next-quarter' | 'next-year' | 'custom'

  defineProps<{
    preset: Preset
    planMonthCount: number
  }>()

  const emit = defineEmits<{
    'set-preset': [preset: Preset]
    'name-edited': []
  }>()
  const startMonth = defineModel<string>('startMonth', { required: true })
  const endMonth = defineModel<string>('endMonth', { required: true })
  const name = defineModel<string>('name', { required: true })
</script>

<template>
  <div class="space-y-5">
    <!-- Presets -->
    <div>
      <label
        class="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2"
      >
        Plage
      </label>
      <div
        class="inline-flex flex-wrap gap-1.5 rounded-lg bg-gray-100 dark:bg-slate-700/50 p-1"
      >
        <button
          v-for="opt in [
            { value: 'next-month', label: 'Mois prochain' },
            { value: 'next-quarter', label: 'Trimestre suivant' },
            { value: 'next-year', label: 'Année suivante' },
            { value: 'custom', label: 'Personnalisé' },
          ]"
          :key="opt.value"
          type="button"
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
          :class="
            preset === opt.value
              ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          "
          @click="emit('set-preset', opt.value as Preset)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Month inputs -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label
          for="start-month"
          class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
        >
          Mois de début
        </label>
        <input
          id="start-month"
          v-model="startMonth"
          type="month"
          data-testid="new-plan-start-month"
          class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-sm"
          @change="emit('set-preset', 'custom')"
        />
      </div>
      <div>
        <label
          for="end-month"
          class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
        >
          Mois de fin
        </label>
        <input
          id="end-month"
          v-model="endMonth"
          type="month"
          data-testid="new-plan-end-month"
          class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-sm"
          @change="emit('set-preset', 'custom')"
        />
      </div>
    </div>

    <p
      v-if="planMonthCount > 0"
      class="text-xs text-gray-500 dark:text-gray-400"
    >
      Durée : {{ planMonthCount }} mois
    </p>

    <!-- Name -->
    <div>
      <label
        for="plan-name"
        class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
      >
        Nom du budget
      </label>
      <input
        id="plan-name"
        v-model="name"
        type="text"
        data-testid="new-plan-name"
        class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-sm"
        @input="emit('name-edited')"
      />
    </div>
  </div>
</template>
