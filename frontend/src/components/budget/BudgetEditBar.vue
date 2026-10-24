<script setup lang="ts">
  import { computed } from 'vue'
  import {
    formatEuros as euros,
    formatSignedEuros,
    plural,
  } from '@/lib/formatters'
  import { STATE_BADGE_CLASSES, deltaTone } from '@/lib/stateTints'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import IconCheckCircle from '@/components/icons/IconCheckCircle.vue'

  /**
   * The only way a budget change reaches the server. Sticky at the bottom
   * so the count of pending changes and the way out are never scrolled
   * away from; the saved → draft totals make the consequence readable
   * before committing. The totals are the page's one computation, the
   * same « Planification » shows (budget-refonte.md, lot 4); the change
   * is said in the state tints — teal for a drop, amber for a rise, grey
   * for none.
   *
   * The outcome of a save is said here too, next to the button that asked
   * for it, in a live region that exists before the message does: a
   * success turns the bar teal for a moment, a failure stays, in the
   * page's error alert, until the draft is saved or dropped.
   */
  const props = withDefaults(
    defineProps<{
      /** The envelopes the draft changes. */
      dirtyCount: number
      /** Whether the draft changes the reference income too. */
      incomeChanged?: boolean | undefined
      savedTotal: number
      draftTotal: number
      delta: number
      saving: boolean
      status?: 'idle' | 'saved' | 'error' | undefined
      errorMessage?: string | null | undefined
    }>(),
    { incomeChanged: false, status: 'idle', errorMessage: null }
  )

  const emit = defineEmits<{ save: []; cancel: [] }>()

  const hasChanges = computed(() => props.dirtyCount > 0 || props.incomeChanged)
  const tone = computed(() => deltaTone(props.delta))

  /** « −30 € par mois », « +30 € par mois », « 0 € par mois ». */
  const deltaLabel = computed(
    () => `${formatSignedEuros(props.delta)} par mois`
  )

  /** « 2 enveloppes modifiées », « revenus de référence modifiés ». */
  const changesLabel = computed(() => {
    const parts: string[] = []
    const n = props.dirtyCount
    if (n > 0)
      parts.push(`${n} ${plural(n, 'enveloppe')} ${plural(n, 'modifiée')}`)
    if (props.incomeChanged)
      parts.push(
        n > 0 ? 'revenus de référence' : 'Revenus de référence modifiés'
      )
    return parts.join(' et ')
  })

  const BADGE =
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums whitespace-nowrap'
</script>

<template>
  <div
    data-testid="budget-edit-bar"
    class="sticky bottom-0 z-10 mt-4 -mx-4 flex flex-col gap-2 border-t bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:rounded-xl sm:border sm:pb-3 dark:bg-slate-900 dark:shadow-slate-900/40"
    :class="
      status === 'saved'
        ? 'border-teal-200 dark:border-teal-800'
        : 'border-gray-200 dark:border-slate-700'
    "
  >
    <!-- Always in the DOM, so a screen reader hears what lands in it. -->
    <div
      aria-live="polite"
      data-testid="budget-save-feedback"
      class="text-sm"
      :class="{
        'flex items-center gap-2 text-teal-700 dark:text-teal-300':
          status === 'saved',
        hidden: status === 'idle',
      }"
    >
      <template v-if="status === 'saved'">
        <IconCheckCircle class="h-4 w-4 shrink-0" />
        Budget enregistré.
      </template>
      <InlineAlert v-else-if="status === 'error'">
        L’enregistrement a échoué : {{ errorMessage ?? 'réessayez.' }} Vos
        modifications sont conservées.
      </InlineAlert>
    </div>

    <!-- A phone gets the two figures that matter; the full sentence
         cost three lines of a viewport already short of them. -->
    <p
      v-if="status !== 'saved'"
      class="flex flex-wrap items-center gap-x-1.5 text-sm text-gray-600 sm:hidden dark:text-gray-400"
    >
      <span
        v-if="hasChanges"
        class="font-medium text-gray-900 dark:text-gray-100"
      >
        <template v-if="dirtyCount > 0">
          {{ dirtyCount }} modifiée{{ dirtyCount > 1 ? 's' : '' }}
        </template>
        <template v-else>Revenus modifiés</template>
      </span>
      <span v-else>Aucune modification</span>
      <template v-if="hasChanges">
        <span class="text-gray-300 dark:text-gray-600">·</span>
        <span :class="[BADGE, STATE_BADGE_CLASSES[tone]]" :data-tone="tone">{{
          deltaLabel
        }}</span>
      </template>
    </p>
    <p
      v-if="status !== 'saved'"
      class="hidden text-sm text-gray-600 sm:flex sm:flex-wrap sm:items-center sm:gap-x-1.5 dark:text-gray-400"
    >
      <span
        v-if="hasChanges"
        data-testid="budget-dirty-count"
        class="font-medium text-gray-900 dark:text-gray-100"
      >
        {{ changesLabel }}
      </span>
      <span v-else>Aucune modification</span>
      <span class="text-gray-300 dark:text-gray-600">·</span>
      <span class="tabular-nums" data-testid="budget-edit-total">
        Total {{ euros(savedTotal) }}
        <template v-if="hasChanges">
          →
          <strong
            class="text-gray-900 dark:text-gray-100"
            data-testid="budget-edit-draft-total"
          >
            {{ euros(draftTotal) }}
          </strong>
        </template>
      </span>
      <span
        v-if="hasChanges"
        :class="[BADGE, STATE_BADGE_CLASSES[tone]]"
        :data-tone="tone"
        data-testid="budget-draft-delta"
        >{{ deltaLabel }}</span
      >
      <span v-else class="text-gray-500 dark:text-gray-400">par mois</span>
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
        :disabled="!hasChanges"
        :loading="saving"
        @click="emit('save')"
      >
        {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
      </BaseButton>
    </div>
  </div>
</template>
