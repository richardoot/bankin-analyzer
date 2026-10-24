<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import type { SegmentedOption } from '@/components/ui/SegmentedControl.vue'
  import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
  import IconChevronDown from '@/components/icons/IconChevronDown.vue'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import type { BreakdownMode } from '@/composables/useDashboardData'

  /**
   * « Lecture ▾ »: the ways of reading the figures, out of the page and
   * behind one button that says, in a line, which one is on. The reading
   * (Vie courante / Tout) and the two reimbursement switches live here,
   * with what tells them apart; the state itself stays with its owners —
   * the reading in useDashboardData, the switches in the filters store —
   * and comes back through the three v-models.
   *
   * A popover hanging under the button on a desk, a sheet (BaseModal)
   * under `sm`. Escape, a click elsewhere or Tab out closes the popover
   * and hands the keyboard back to the button.
   */
  const props = withDefaults(
    defineProps<{
      /** Vie courante or Tout. */
      breakdownMode: BreakdownMode
      deductReimbursements: boolean
      deductPendingReimbursements: boolean
      /** An event touches the period: the two readings differ by it. */
      hasExceptionalExpenses?: boolean | undefined
      /** A smoothed purchase is spread over the period. */
      hasAmortizedExpenses?: boolean | undefined
      /** Why the « en attente » preference could not be kept, if it could not. */
      pendingSyncError?: string | null | undefined
    }>(),
    {
      hasExceptionalExpenses: false,
      hasAmortizedExpenses: false,
      pendingSyncError: null,
    }
  )

  const emit = defineEmits<{
    'update:breakdownMode': [mode: BreakdownMode]
    'update:deductReimbursements': [value: boolean]
    'update:deductPendingReimbursements': [value: boolean]
  }>()

  const READING_OPTIONS: SegmentedOption<BreakdownMode>[] = [
    {
      value: 'everyday',
      label: 'Vie courante',
      testId: 'breakdown-mode-everyday',
    },
    { value: 'real', label: 'Tout', testId: 'breakdown-mode-real' },
  ]

  /**
   * Without an event nor a smoothed purchase the two readings are the same
   * figures: the choice is not offered, and the button does not name it.
   */
  const offersReading = computed(
    () => props.hasExceptionalExpenses || props.hasAmortizedExpenses
  )

  const reimbursementsState = computed(() => {
    const received = props.deductReimbursements
    const pending = props.deductPendingReimbursements
    if (received && pending) return 'remboursements déduits'
    if (received) return 'remboursements reçus déduits'
    if (pending) return 'remboursements en attente déduits'
    return 'remboursements non déduits'
  })

  /** The state in one line: « Lecture : vie courante · remboursements déduits ». */
  const stateLabel = computed(() => {
    const parts = offersReading.value
      ? [
          props.breakdownMode === 'everyday' ? 'vie courante' : 'tout',
          reimbursementsState.value,
        ]
      : [reimbursementsState.value]
    return `Lecture : ${parts.join(' · ')}`
  })

  const isPhone = useMediaQuery('(max-width: 639.98px)')

  const open = ref(false)
  const root = ref<HTMLElement | null>(null)
  const panelId = useId()
  const titleId = `${panelId}-title`
  const readingLabelId = `${panelId}-reading`
  const receivedId = `${panelId}-received`
  const pendingId = `${panelId}-pending`
  const TITLE = 'Lecture des chiffres'

  /** What each shell needs to name itself. */
  const shellAttrs = computed(() =>
    isPhone.value
      ? { open: true, title: TITLE, maxWidth: 'sm' }
      : {
          id: panelId,
          role: 'dialog',
          'aria-labelledby': titleId,
          class:
            'absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-800',
        }
  )

  function button(): HTMLElement | null {
    return root.value?.querySelector<HTMLElement>('button') ?? null
  }

  function close(returnFocus: boolean): void {
    if (!open.value) return
    open.value = false
    if (returnFocus) void nextTick(() => button()?.focus())
  }

  function toggle(): void {
    if (open.value) close(true)
    else open.value = true
  }

  function onDocMouseDown(event: MouseEvent): void {
    if (root.value && !root.value.contains(event.target as Node)) close(false)
  }

  /** Tabbing out of the popover closes it; the sheet keeps its own focus. */
  function onFocusOut(event: FocusEvent): void {
    if (isPhone.value) return
    const next = event.relatedTarget as Node | null
    if (next && root.value && !root.value.contains(next)) close(false)
  }

  watch(open, isOpen => {
    if (isPhone.value) return
    if (isOpen) document.addEventListener('mousedown', onDocMouseDown)
    else document.removeEventListener('mousedown', onDocMouseDown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocMouseDown)
  })
</script>

<template>
  <div
    ref="root"
    class="relative inline-block max-w-full"
    data-testid="reading-menu"
    @focusout="onFocusOut"
    @keydown.esc.stop="!isPhone && close(true)"
  >
    <BaseButton
      variant="secondary"
      size="sm"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      data-testid="reading-menu-button"
      class="max-w-full text-left"
      @click="toggle"
    >
      <span class="min-w-0 truncate">{{ stateLabel }}</span>
      <IconChevronDown
        class="h-4 w-4 shrink-0 transition-transform"
        :class="open ? 'rotate-180' : ''"
      />
    </BaseButton>

    <!-- One body, two shells: a popover on a desk, a sheet on a phone. -->
    <component
      :is="isPhone ? BaseModal : 'div'"
      v-if="open"
      v-bind="shellAttrs"
      data-testid="reading-menu-panel"
      @close="close(true)"
    >
      <h2
        v-if="!isPhone"
        :id="titleId"
        class="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100"
      >
        {{ TITLE }}
      </h2>

      <div class="space-y-4">
        <!-- The reading: the whole page follows it together. -->
        <div v-if="offersReading" class="space-y-2">
          <span
            :id="readingLabelId"
            class="block text-xs font-medium text-gray-700 dark:text-gray-300"
          >
            Lecture des dépenses
          </span>
          <SegmentedControl
            :model-value="breakdownMode"
            size="sm"
            :labelled-by="readingLabelId"
            :options="READING_OPTIONS"
            @update:model-value="emit('update:breakdownMode', $event)"
          />
          <p
            v-if="hasExceptionalExpenses"
            class="text-xs text-gray-500 dark:text-gray-400"
          >
            {{
              breakdownMode === 'everyday'
                ? 'Les dépenses d’événements sont mises à part.'
                : 'Les dépenses d’événements sont comprises.'
            }}
          </p>
          <!-- A smoothed purchase counts by its slices: the figures are no
               longer the cash, and the reading says so. -->
          <p
            v-if="hasAmortizedExpenses"
            class="text-xs text-teal-800 dark:text-teal-300"
            data-testid="dashboard-amortized-note"
          >
            {{
              breakdownMode === 'everyday'
                ? 'Les achats lissés comptent par tranches mensuelles : un total sur la période ne correspond plus à l’argent sorti du compte.'
                : 'Les achats lissés comptent en entier à leur date.'
            }}
          </p>
        </div>

        <div
          class="space-y-2"
          :class="
            offersReading
              ? 'border-t border-gray-100 pt-4 dark:border-slate-700'
              : ''
          "
        >
          <label
            :for="receivedId"
            class="flex min-h-[44px] cursor-pointer items-center gap-2.5 select-none sm:min-h-0"
          >
            <ToggleSwitch
              :id="receivedId"
              :checked="deductReimbursements"
              label="Déduire les remboursements reçus"
              data-testid="toggle-deduct-reimbursements"
              @change="emit('update:deductReimbursements', $event)"
            />
            <span class="text-sm text-gray-700 dark:text-gray-300">
              Déduire les remboursements reçus
            </span>
          </label>
          <label
            :for="pendingId"
            class="flex min-h-[44px] cursor-pointer items-center gap-2.5 select-none sm:min-h-0"
          >
            <ToggleSwitch
              :id="pendingId"
              :checked="deductPendingReimbursements"
              label="Déduire les remboursements en attente"
              data-testid="toggle-deduct-pending"
              @change="emit('update:deductPendingReimbursements', $event)"
            />
            <span class="text-sm text-gray-700 dark:text-gray-300">
              Déduire les remboursements en attente
            </span>
          </label>
          <!-- The two switches look alike but are not: one is a reading of
               this screen, the other a preference the budget shares. -->
          <p class="text-xs text-gray-500 dark:text-gray-400">
            « En attente » est une préférence enregistrée, partagée avec le
            Budget ; « reçus » ne vaut que pour cette lecture.
          </p>
          <InlineAlert
            v-if="pendingSyncError"
            variant="warning"
            data-testid="dashboard-pending-sync-error"
          >
            Le réglage « en attente » s'applique ici, mais n'a pas pu être
            enregistré sur le serveur : {{ pendingSyncError }}
          </InlineAlert>
        </div>
      </div>
    </component>
  </div>
</template>
