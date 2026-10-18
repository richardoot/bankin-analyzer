<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseCheckbox from '@/components/ui/BaseCheckbox.vue'
  import SectionLabel from '@/components/ui/SectionLabel.vue'
  import type { ImportPreviewResultDto } from '@/lib/api'
  import { formatCurrency, formatDate } from '@/lib/formatters'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import { transactionsLink } from '@/lib/transactionsLink'

  /**
   * The decision « import this row or not » rests on a checkbox: the whole
   * row is the label, 44px tall on a touch screen, rather than a 16px square
   * beside it. The side-by-side comparison of a row already in the base
   * stacks under md, where two columns would truncate both.
   */
  const props = defineProps<{
    isOpen: boolean
    loading: boolean
    previewResult: ImportPreviewResultDto | null
  }>()

  const emit = defineEmits<{
    close: []
    confirm: [selectedIndices: Set<number>]
  }>()

  // Track selected indices for internal duplicates (which ones to import)
  const selectedInternalIndices = ref<Set<number>>(new Set())
  // Track selected indices for external duplicates (force import)
  const selectedExternalIndices = ref<Set<number>>(new Set())

  // Initialize selections when preview result changes
  watch(
    () => props.previewResult,
    result => {
      if (result) {
        // For internal duplicates: select first occurrence of each group by default
        const internalDefaults = new Set<number>()
        for (const group of result.internalDuplicates) {
          const first = group.indices[0]
          if (first !== undefined) {
            internalDefaults.add(first)
          }
        }
        selectedInternalIndices.value = internalDefaults
        // For external duplicates: don't select any by default
        selectedExternalIndices.value = new Set()
      }
    },
    { immediate: true }
  )

  const totalToImport = computed(() => {
    if (!props.previewResult) return 0
    return (
      props.previewResult.newCount +
      selectedInternalIndices.value.size +
      selectedExternalIndices.value.size
    )
  })

  const totalSkipped = computed(() => {
    if (!props.previewResult) return 0
    // Count internal duplicates not selected
    let internalSkipped = 0
    for (const group of props.previewResult.internalDuplicates) {
      for (const idx of group.indices) {
        if (!selectedInternalIndices.value.has(idx)) {
          internalSkipped++
        }
      }
    }
    // Count external duplicates not selected
    const externalSkipped =
      props.previewResult.externalDuplicateCount -
      selectedExternalIndices.value.size
    return internalSkipped + externalSkipped
  })

  // Get all internal duplicate indices (flattened from all groups)
  const allInternalIndices = computed(() => {
    if (!props.previewResult) return []
    return props.previewResult.internalDuplicates.flatMap(
      group => group.indices
    )
  })

  // Check if all internal duplicates are selected
  const allInternalSelected = computed(() => {
    if (allInternalIndices.value.length === 0) return false
    return allInternalIndices.value.every(idx =>
      selectedInternalIndices.value.has(idx)
    )
  })

  // Check if some (but not all) internal duplicates are selected
  const someInternalSelected = computed(() => {
    if (allInternalIndices.value.length === 0) return false
    const selectedCount = selectedInternalIndices.value.size
    return selectedCount > 0 && selectedCount < allInternalIndices.value.length
  })

  // Check if all external duplicates are selected
  const allExternalSelected = computed(() => {
    if (
      !props.previewResult ||
      props.previewResult.externalDuplicates.length === 0
    ) {
      return false
    }
    return props.previewResult.externalDuplicates.every(dup =>
      selectedExternalIndices.value.has(dup.uploaded.index)
    )
  })

  // Check if some (but not all) external duplicates are selected
  const someExternalSelected = computed(() => {
    if (
      !props.previewResult ||
      props.previewResult.externalDuplicates.length === 0
    ) {
      return false
    }
    const selectedCount = selectedExternalIndices.value.size
    return (
      selectedCount > 0 &&
      selectedCount < props.previewResult.externalDuplicates.length
    )
  })

  function toggleInternalIndex(index: number) {
    const newSet = new Set(selectedInternalIndices.value)
    if (newSet.has(index)) {
      newSet.delete(index)
    } else {
      newSet.add(index)
    }
    selectedInternalIndices.value = newSet
  }

  function toggleAllInternalDuplicates() {
    if (allInternalSelected.value) {
      // Deselect all
      selectedInternalIndices.value = new Set()
    } else {
      // Select all
      selectedInternalIndices.value = new Set(allInternalIndices.value)
    }
  }

  function toggleExternalIndex(index: number) {
    const newSet = new Set(selectedExternalIndices.value)
    if (newSet.has(index)) {
      newSet.delete(index)
    } else {
      newSet.add(index)
    }
    selectedExternalIndices.value = newSet
  }

  function toggleAllExternalDuplicates() {
    if (!props.previewResult) return

    if (allExternalSelected.value) {
      // Deselect all
      selectedExternalIndices.value = new Set()
    } else {
      // Select all
      const allIndices = new Set(
        props.previewResult.externalDuplicates.map(dup => dup.uploaded.index)
      )
      selectedExternalIndices.value = allIndices
    }
  }

  function handleClose() {
    emit('close')
  }

  function handleConfirm() {
    // Combine all selected indices that need forceImport
    const allSelected = new Set([
      ...selectedInternalIndices.value,
      ...selectedExternalIndices.value,
    ])
    emit('confirm', allSelected)
  }

  function amountClass(amount: number): string {
    return amount < 0
      ? 'text-red-600 dark:text-red-400'
      : 'text-green-700 dark:text-green-400'
  }
</script>

<template>
  <BaseModal
    :open="isOpen && previewResult !== null"
    title="Doublons détectés"
    tone="warning"
    max-width="2xl"
    :closable="!loading"
    data-testid="duplicates-modal"
    @close="handleClose"
  >
    <div v-if="previewResult" class="space-y-6">
      <!-- Summary -->
      <div class="rounded-lg bg-gray-50 p-4 dark:bg-slate-800">
        <h3 class="mb-3 font-medium text-gray-900 dark:text-gray-100">
          Résumé
        </h3>
        <div class="grid grid-cols-3 gap-2 text-sm sm:gap-4">
          <div class="text-center">
            <p class="text-2xl font-bold text-green-700 dark:text-green-400">
              {{ previewResult.newCount }}
            </p>
            <p class="text-gray-600 dark:text-gray-400">Nouvelles</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-amber-700 dark:text-amber-400">
              {{ previewResult.internalDuplicateCount }}
            </p>
            <p class="text-gray-600 dark:text-gray-400">Doublons internes</p>
          </div>
          <div class="text-center">
            <!-- Already in the account: skipped, nothing goes wrong — neutral,
                 where the internal duplicates still ask for a decision. -->
            <p class="text-2xl font-bold text-gray-700 dark:text-gray-300">
              {{ previewResult.externalDuplicateCount }}
            </p>
            <p class="text-gray-600 dark:text-gray-400">Déjà importées</p>
          </div>
        </div>
      </div>

      <!-- Internal Duplicates -->
      <section
        v-if="previewResult.internalDuplicates.length > 0"
        class="space-y-4"
        data-testid="internal-duplicates"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-medium text-gray-900 dark:text-gray-100">
            Doublons internes (dans ce fichier)
          </h3>
          <BaseCheckbox
            :model-value="allInternalSelected"
            :indeterminate="someInternalSelected"
            label="Tout sélectionner"
            data-testid="internal-select-all"
            @update:model-value="toggleAllInternalDuplicates"
          />
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Ces transactions apparaissent plusieurs fois dans votre fichier.
          Sélectionnez celles à importer.
        </p>

        <div
          v-for="(group, groupIdx) in previewResult.internalDuplicates"
          :key="group.hash"
          class="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700"
        >
          <div
            class="border-b border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-800 dark:bg-amber-900/20"
          >
            <span
              class="text-sm font-medium text-amber-800 dark:text-amber-300"
            >
              Groupe {{ groupIdx + 1 }} : {{ group.indices.length }}
              transactions identiques
            </span>
          </div>
          <div class="divide-y divide-gray-100 dark:divide-slate-700">
            <!-- The whole row is the label: the decision does not rest on 16px. -->
            <label
              v-for="tx in group.transactions"
              :key="tx.index"
              class="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-gray-50 pointer-coarse:min-h-[44px] dark:hover:bg-slate-800"
              :data-testid="`internal-row-${tx.index}`"
            >
              <input
                type="checkbox"
                :checked="selectedInternalIndices.has(tx.index)"
                :aria-label="`Importer la transaction ${tx.index + 1}`"
                class="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 dark:border-slate-600 dark:bg-slate-800"
                @change="toggleInternalIndex(tx.index)"
              />
              <span class="min-w-0 flex-1">
                <span class="flex items-center justify-between gap-3">
                  <span class="text-xs text-gray-500 dark:text-gray-400"
                    >#{{ tx.index + 1 }}</span
                  >
                  <span
                    class="font-semibold tabular-nums"
                    :class="amountClass(tx.amount)"
                  >
                    {{ formatCurrency(tx.amount) }}
                  </span>
                </span>
                <span
                  class="block truncate font-medium text-gray-900 dark:text-gray-100"
                  :title="tx.description"
                >
                  {{ tx.description }}
                </span>
                <span class="block text-sm text-gray-500 dark:text-gray-400">
                  {{ formatDate(tx.date) }} · {{ tx.category }}
                </span>
              </span>
            </label>
          </div>
        </div>
      </section>

      <!-- External Duplicates -->
      <section
        v-if="previewResult.externalDuplicates.length > 0"
        class="space-y-4"
        data-testid="external-duplicates"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-medium text-gray-900 dark:text-gray-100">
            Déjà en base de données
          </h3>
          <BaseCheckbox
            :model-value="allExternalSelected"
            :indeterminate="someExternalSelected"
            label="Tout sélectionner"
            data-testid="external-select-all"
            @update:model-value="toggleAllExternalDuplicates"
          />
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Ces transactions existent déjà dans votre historique. Cochez pour les
          importer quand même.
        </p>

        <div
          v-for="dup in previewResult.externalDuplicates"
          :key="dup.hash"
          class="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700"
          :data-testid="`external-row-${dup.uploaded.index}`"
        >
          <div
            class="border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800"
          >
            <span class="text-sm font-medium text-gray-800 dark:text-gray-200">
              Transaction #{{ dup.uploaded.index + 1 }} existe déjà
            </span>
          </div>

          <!-- Side by side on a desk, stacked as two cards under md -->
          <div
            class="grid grid-cols-1 divide-y divide-gray-200 md:grid-cols-2 md:divide-x md:divide-y-0 dark:divide-slate-700"
          >
            <!-- Uploaded -->
            <div class="p-4">
              <SectionLabel class="mb-2">Dans l'import</SectionLabel>
              <dl class="space-y-1 text-sm">
                <div class="flex gap-2">
                  <dt class="shrink-0 text-gray-500 dark:text-gray-400">
                    Date :
                  </dt>
                  <dd>{{ formatDate(dup.uploaded.date) }}</dd>
                </div>
                <div class="flex min-w-0 gap-2">
                  <dt class="shrink-0 text-gray-500 dark:text-gray-400">
                    Description :
                  </dt>
                  <dd class="truncate" :title="dup.uploaded.description">
                    {{ dup.uploaded.description }}
                  </dd>
                </div>
                <div class="flex gap-2">
                  <dt class="shrink-0 text-gray-500 dark:text-gray-400">
                    Montant :
                  </dt>
                  <dd
                    class="tabular-nums"
                    :class="amountClass(dup.uploaded.amount)"
                  >
                    {{ formatCurrency(dup.uploaded.amount) }}
                  </dd>
                </div>
                <div class="flex min-w-0 gap-2">
                  <dt class="shrink-0 text-gray-500 dark:text-gray-400">
                    Catégorie :
                  </dt>
                  <dd class="truncate" :title="dup.uploaded.category">
                    {{ dup.uploaded.category }}
                  </dd>
                </div>
              </dl>
            </div>

            <!-- Existing -->
            <div class="bg-gray-50 p-4 dark:bg-slate-800">
              <SectionLabel class="mb-2">En base</SectionLabel>
              <dl class="space-y-1 text-sm">
                <div class="flex gap-2">
                  <dt class="shrink-0 text-gray-500 dark:text-gray-400">
                    Date :
                  </dt>
                  <dd>{{ formatDate(dup.existing.date) }}</dd>
                </div>
                <div class="flex min-w-0 gap-2">
                  <dt class="shrink-0 text-gray-500 dark:text-gray-400">
                    Description :
                  </dt>
                  <dd class="truncate" :title="dup.existing.description">
                    {{ dup.existing.description }}
                  </dd>
                </div>
                <div class="flex gap-2">
                  <dt class="shrink-0 text-gray-500 dark:text-gray-400">
                    Montant :
                  </dt>
                  <dd
                    class="tabular-nums"
                    :class="amountClass(dup.existing.amount)"
                  >
                    {{ formatCurrency(dup.existing.amount) }}
                  </dd>
                </div>
                <div class="flex min-w-0 gap-2">
                  <dt class="shrink-0 text-gray-500 dark:text-gray-400">
                    Catégorie :
                  </dt>
                  <dd
                    class="truncate"
                    :title="dup.existing.categoryName || undefined"
                  >
                    {{ dup.existing.categoryName || '—' }}
                  </dd>
                </div>
                <div
                  class="flex flex-wrap items-center gap-x-2 text-xs text-gray-500 dark:text-gray-400"
                >
                  Importée le {{ formatDate(dup.existing.createdAt) }}
                  <!-- An import is under way: the row opens beside it. -->
                  <TransactionsLink
                    :to="
                      transactionsLink({
                        ids: [dup.existing.id],
                        label: dup.existing.description,
                      })
                    "
                    :subject="dup.existing.description"
                    new-tab
                    :data-testid="`existing-transaction-link-${dup.uploaded.index}`"
                  >
                    La voir
                  </TransactionsLink>
                </div>
              </dl>
            </div>
          </div>

          <!-- Force import checkbox -->
          <div
            class="border-t border-gray-200 bg-gray-50 px-4 py-1 dark:border-slate-700 dark:bg-slate-800"
          >
            <BaseCheckbox
              :model-value="selectedExternalIndices.has(dup.uploaded.index)"
              label="Importer quand même"
              :data-testid="`external-force-${dup.uploaded.index}`"
              @update:model-value="toggleExternalIndex(dup.uploaded.index)"
            />
          </div>
        </div>
      </section>
    </div>

    <template #footer-start>
      <p class="text-gray-600 dark:text-gray-400" data-testid="import-summary">
        <span class="font-medium text-green-700 dark:text-green-400">{{
          totalToImport
        }}</span>
        à importer,
        <span class="font-medium text-gray-500 dark:text-gray-400">{{
          totalSkipped
        }}</span>
        ignorées
      </p>
    </template>

    <template #footer>
      <BaseButton variant="secondary" :disabled="loading" @click="handleClose">
        Annuler
      </BaseButton>
      <BaseButton
        :disabled="totalToImport === 0"
        :loading="loading"
        data-testid="duplicates-confirm"
        @click="handleConfirm"
      >
        Importer {{ totalToImport }} transactions
      </BaseButton>
    </template>
  </BaseModal>
</template>
