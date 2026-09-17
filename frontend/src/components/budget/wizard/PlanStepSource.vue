<script setup lang="ts">
  import type { BudgetPlanSummaryDto } from '@/lib/api'

  /**
   * Étape 2 — d'où partent les enveloppes. Tout est v-model : la
   * source, la période de référence, la base (vie courante ou tout),
   * les déductions de remboursements et le plan à copier. Le parent
   * écoute ces modèles et charge l'aperçu pendant que l'étape est
   * active.
   */
  export type InitSource = 'averages' | 'copy' | 'empty'
  export type LookbackOption = '3m' | '6m' | '12m'
  export type SeedBasis = 'everyday' | 'all'

  defineProps<{
    existingPlans: BudgetPlanSummaryDto[]
    isLoadingPlans: boolean
    hasExceptionalInLookback: boolean
  }>()

  const initSource = defineModel<InitSource>('initSource', { required: true })
  const lookback = defineModel<LookbackOption>('lookback', { required: true })
  const seedBasis = defineModel<SeedBasis>('seedBasis', { required: true })
  const deductReimbursements = defineModel<boolean>('deductReimbursements', {
    required: true,
  })
  const deductPendingReimbursements = defineModel<boolean>(
    'deductPendingReimbursements',
    { required: true }
  )
  const copyFromPlanId = defineModel<string | null>('copyFromPlanId', {
    required: true,
  })
</script>

<template>
  <div class="space-y-5">
    <div>
      <label
        class="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2"
      >
        Comment initialiser les montants ?
      </label>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          v-for="opt in [
            { value: 'averages', label: 'Reprendre les moyennes' },
            { value: 'copy', label: 'Copier un budget existant' },
            { value: 'empty', label: 'Partir de zéro' },
          ]"
          :key="opt.value"
          type="button"
          :data-testid="`init-source-${opt.value}`"
          class="px-3 py-2 text-sm font-medium rounded-lg border transition-colors text-left"
          :class="
            initSource === opt.value
              ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
              : 'border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800'
          "
          @click="initSource = opt.value as InitSource"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Lookback selector + reimbursement toggles for averages -->
    <div v-if="initSource === 'averages'" class="space-y-3">
      <div>
        <label
          class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
        >
          Période de référence pour les moyennes
        </label>
        <div
          class="inline-flex rounded-lg bg-gray-100 dark:bg-slate-700/50 p-1"
        >
          <button
            v-for="opt in [
              { value: '3m', label: '3 mois' },
              { value: '6m', label: '6 mois' },
              { value: '12m', label: '12 mois' },
            ]"
            :key="opt.value"
            type="button"
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            :class="
              lookback === opt.value
                ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            "
            @click="lookback = opt.value as LookbackOption"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- Which historical figure seeds the envelopes -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span class="text-xs font-medium text-gray-600 dark:text-gray-400">
          Base des enveloppes
        </span>
        <div
          class="inline-flex rounded-lg bg-gray-100 dark:bg-slate-700/50 p-0.5"
        >
          <button
            v-for="opt in [
              { value: 'everyday', label: 'Vie courante' },
              { value: 'all', label: 'Tout' },
            ]"
            :key="opt.value"
            type="button"
            :data-testid="`seed-basis-${opt.value}`"
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            :class="
              seedBasis === opt.value
                ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            "
            @click="seedBasis = opt.value as SeedBasis"
          >
            {{ opt.label }}
          </button>
        </div>
        <span
          v-if="hasExceptionalInLookback"
          data-testid="seed-basis-hint"
          class="text-xs text-gray-500 dark:text-gray-400 leading-snug"
        >
          {{
            seedBasis === 'everyday'
              ? 'Les dépenses étiquetées exceptionnelles sont retirées : un voyage ponctuel ne doit pas être budgété tous les mois.'
              : 'Les événements ponctuels de la période sont inclus dans chaque enveloppe mensuelle.'
          }}
        </span>
      </div>

      <div
        class="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5"
      >
        <button
          type="button"
          role="switch"
          :aria-checked="deductReimbursements"
          data-testid="modal-toggle-deduct-reimbursements"
          class="group flex items-center gap-2.5 cursor-pointer select-none"
          @click="deductReimbursements = !deductReimbursements"
        >
          <span
            class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200"
            :class="
              deductReimbursements
                ? 'bg-primary-500'
                : 'bg-gray-300 dark:bg-slate-600'
            "
          >
            <span
              class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200"
              :class="
                deductReimbursements ? 'translate-x-4' : 'translate-x-0.5'
              "
            />
          </span>
          <span
            class="text-sm text-gray-700 dark:text-gray-300"
            title="Soustrait tous les revenus enregistrés dans les catégories de revenus liées à une catégorie de dépense (via les associations de catégories)."
          >
            Déduire les remboursements reçus
          </span>
        </button>
        <button
          type="button"
          role="switch"
          :aria-checked="deductPendingReimbursements"
          data-testid="modal-toggle-deduct-pending"
          class="group flex items-center gap-2.5 cursor-pointer select-none"
          @click="deductPendingReimbursements = !deductPendingReimbursements"
        >
          <span
            class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200"
            :class="
              deductPendingReimbursements
                ? 'bg-primary-500'
                : 'bg-gray-300 dark:bg-slate-600'
            "
          >
            <span
              class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200"
              :class="
                deductPendingReimbursements
                  ? 'translate-x-4'
                  : 'translate-x-0.5'
              "
            />
          </span>
          <span
            class="text-sm text-gray-700 dark:text-gray-300"
            title="Soustrait le montant restant à percevoir (montant − déjà reçu) des demandes de remboursement actives (statut En attente ou Partiel)."
          >
            Déduire les remboursements en attente
          </span>
        </button>
      </div>

      <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        Les pastilles colorées sur chaque ligne indiquent le montant réellement
        déduit par catégorie. Sans pastille, rien n'a été déduit pour cette
        catégorie sur la période.
      </p>
    </div>

    <!-- Plan picker for "copy" -->
    <div v-else-if="initSource === 'copy'">
      <label
        for="copy-plan"
        class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
      >
        Plan source
      </label>
      <select
        id="copy-plan"
        v-model="copyFromPlanId"
        data-testid="copy-plan-select"
        class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-sm"
      >
        <option :value="null">— Choisir un plan —</option>
        <option v-for="p in existingPlans" :key="p.id" :value="p.id">
          {{ p.name }} ({{ p.startDate }} → {{ p.endDate }})
        </option>
      </select>
      <p
        v-if="!isLoadingPlans && existingPlans.length === 0"
        class="text-xs text-gray-500 dark:text-gray-400 mt-1"
      >
        Aucun plan précédent disponible.
      </p>
    </div>
  </div>
</template>
