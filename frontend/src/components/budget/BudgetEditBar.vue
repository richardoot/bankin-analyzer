<script setup lang="ts">
  import { formatCurrency } from '@/lib/formatters'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import IconCheckCircle from '@/components/icons/IconCheckCircle.vue'

  /**
   * The only way a budget change reaches the server. Sticky at the bottom
   * so the count of pending changes and the way out are never scrolled
   * away from; the saved → draft totals make the consequence readable
   * before committing.
   *
   * The outcome of a save is said here too, next to the button that asked
   * for it, in a live region that exists before the message does: a
   * success turns the bar green for a moment, a failure stays until the
   * draft is saved or dropped.
   */
  withDefaults(
    defineProps<{
      dirtyCount: number
      savedTotal: number
      draftTotal: number
      delta: number
      saving: boolean
      status?: 'idle' | 'saved' | 'error' | undefined
      errorMessage?: string | null | undefined
    }>(),
    { status: 'idle', errorMessage: null }
  )

  const emit = defineEmits<{ save: []; cancel: [] }>()
</script>

<template>
  <div
    data-testid="budget-edit-bar"
    class="sticky bottom-0 z-10 mt-4 -mx-4 flex flex-col gap-2 border-t bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:rounded-xl sm:border sm:pb-3 dark:bg-slate-900 dark:shadow-slate-900/40"
    :class="
      status === 'saved'
        ? 'border-green-200 dark:border-green-800'
        : status === 'error'
          ? 'border-red-200 dark:border-red-800'
          : 'border-gray-200 dark:border-slate-700'
    "
  >
    <!-- Always in the DOM, so a screen reader hears what lands in it. -->
    <p
      aria-live="polite"
      data-testid="budget-save-feedback"
      class="text-sm"
      :class="{
        'flex items-center gap-2 text-green-700 dark:text-green-400':
          status === 'saved',
        'text-red-700 dark:text-red-400': status === 'error',
        hidden: status === 'idle',
      }"
    >
      <template v-if="status === 'saved'">
        <IconCheckCircle class="h-4 w-4 shrink-0" />
        Budget enregistré.
      </template>
      <template v-else-if="status === 'error'">
        L'enregistrement a échoué : {{ errorMessage ?? 'réessayez.' }} Vos
        modifications sont conservées.
      </template>
    </p>

    <!-- A phone gets the two figures that matter; the full sentence
         cost three lines of a viewport already short of them. -->
    <p
      v-if="status !== 'saved'"
      class="text-sm text-gray-600 sm:hidden dark:text-gray-400"
    >
      <span
        v-if="dirtyCount > 0"
        class="font-medium text-gray-900 dark:text-gray-100"
      >
        {{ dirtyCount }} modifiée{{ dirtyCount > 1 ? 's' : '' }}
      </span>
      <span v-else>Aucune modification</span>
      <template v-if="dirtyCount > 0">
        <span class="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
        <span
          class="tabular-nums"
          :class="
            delta > 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-primary-700 dark:text-primary-400'
          "
        >
          {{ delta > 0 ? '+' : '' }}{{ formatCurrency(delta) }} / mois
        </span>
      </template>
    </p>
    <p
      v-if="status !== 'saved'"
      class="hidden text-sm text-gray-600 sm:block dark:text-gray-400"
    >
      <span
        v-if="dirtyCount > 0"
        data-testid="budget-dirty-count"
        class="font-medium text-gray-900 dark:text-gray-100"
      >
        {{ dirtyCount }} catégorie{{ dirtyCount > 1 ? 's' : '' }} modifiée{{
          dirtyCount > 1 ? 's' : ''
        }}
      </span>
      <span v-else>Aucune modification</span>
      <span class="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
      <span class="tabular-nums">
        Total {{ formatCurrency(savedTotal) }}
        <template v-if="dirtyCount > 0">
          →
          <strong class="text-gray-900 dark:text-gray-100">
            {{ formatCurrency(draftTotal) }}
          </strong>
          <span
            data-testid="budget-draft-delta"
            :class="
              delta > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-primary-700 dark:text-primary-400'
            "
          >
            ({{ delta > 0 ? '+' : '' }}{{ formatCurrency(delta) }})
          </span>
        </template>
        <span class="text-gray-500 dark:text-gray-400">/ mois</span>
      </span>
    </p>
    <div v-if="status !== 'saved'" class="flex shrink-0 items-center gap-2">
      <BaseButton
        variant="secondary"
        size="sm"
        class="flex-1 sm:flex-none"
        data-testid="budget-cancel-button"
        :disabled="saving"
        @click="emit('cancel')"
      >
        Annuler
      </BaseButton>
      <BaseButton
        size="sm"
        class="flex-1 sm:flex-none"
        data-testid="budget-save-button"
        :disabled="dirtyCount === 0"
        :loading="saving"
        @click="emit('save')"
      >
        {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
      </BaseButton>
    </div>
  </div>
</template>
