<script setup lang="ts">
  import { computed, ref } from 'vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import type { SegmentedOption } from '@/components/ui/SegmentedControl.vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import IconCheck from '@/components/icons/IconCheck.vue'
  import { useMediaQuery } from '@/composables/useMediaQuery'

  /**
   * « Mois lu », the month a band of the Budget page reads, shared by
   * « Ce mois-ci » and « Bilan du plan » (budget-refonte.md, lots 1, 6
   * and 7). On a desk a segment of the months, in the band's header. On a
   * phone a line of six or seven months would scroll out of sight: a link
   * says the month read (« Mois lu : oct. ▾ ») and opens a sheet with the
   * same choices, one per line, 44 px each.
   *
   * The options keep their test ids in both shells — only one is drawn.
   */
  const props = withDefaults(
    defineProps<{
      options: SegmentedOption<string | null>[]
      /** The month read, null for the average (or the plan as a whole). */
      modelValue: string | null
      /** The option still running: a dot beside it. */
      runningValue?: string | null | undefined
    }>(),
    { runningValue: undefined }
  )

  const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

  const isPhone = useMediaQuery('(max-width: 639.98px)')
  const sheetOpen = ref(false)

  /** « oct. », « moyenne », « le plan »: the link's word for the choice. */
  const selectedWord = computed(() => {
    const option = props.options.find(o => o.value === props.modelValue)
    const word = option?.shortLabel ?? option?.label ?? ''
    return word.charAt(0).toLowerCase() + word.slice(1)
  })

  function pick(value: string | null): void {
    sheetOpen.value = false
    if (value !== props.modelValue) emit('update:modelValue', value)
  }
</script>

<template>
  <div
    v-if="options.length > 0"
    data-testid="budget-month-selector"
    class="flex min-w-0 items-center gap-2"
  >
    <!-- A phone: a link that says the month, and a sheet to change it. -->
    <template v-if="isPhone">
      <button
        type="button"
        class="relative inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-medium text-primary-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400"
        aria-haspopup="dialog"
        :aria-expanded="sheetOpen"
        data-testid="budget-month-read-trigger"
        @click="sheetOpen = true"
      >
        Mois lu : {{ selectedWord }}
        <span aria-hidden="true" class="text-xs">▾</span>
      </button>
      <BaseModal
        :open="sheetOpen"
        title="Mois lu"
        max-width="sm"
        data-testid="budget-month-read-sheet"
        @close="sheetOpen = false"
      >
        <div role="radiogroup" aria-label="Mois lu" class="-mx-2 space-y-0.5">
          <button
            v-for="option in options"
            :key="String(option.value)"
            type="button"
            role="radio"
            :aria-checked="option.value === modelValue"
            :title="option.title"
            :data-testid="option.testId"
            class="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            :class="
              option.value === modelValue
                ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-800'
            "
            @click="pick(option.value)"
          >
            <span>
              {{ option.title ?? option.label }}
            </span>
            <IconCheck
              v-if="option.value === modelValue"
              class="h-4 w-4 shrink-0"
            />
          </button>
        </div>
      </BaseModal>
    </template>

    <!-- A desk: the segment, in the band's header. -->
    <template v-else>
      <span
        id="budget-month-read-label"
        class="shrink-0 text-xs text-gray-500 dark:text-gray-400"
      >
        Mois lu
      </span>
      <SegmentedControl
        :model-value="modelValue"
        :options="options"
        size="sm"
        scrollable
        labelled-by="budget-month-read-label"
        data-testid="budget-month-read"
        @update:model-value="emit('update:modelValue', $event)"
      >
        <template #option="{ option }">
          <span
            v-if="runningValue !== undefined && option.value === runningValue"
            class="ml-1 opacity-70"
            aria-hidden="true"
            data-testid="budget-month-running-mark"
            >•</span
          >
        </template>
      </SegmentedControl>
    </template>
  </div>
</template>
