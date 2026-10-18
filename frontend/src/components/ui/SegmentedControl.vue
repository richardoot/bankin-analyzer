<script setup lang="ts" generic="T extends string | number | null">
  import { computed, ref } from 'vue'

  /**
   * One choice among a few, all visible: a period, a reading mode, a
   * theme. Five screens drew this five ways (a gradient pill, a black
   * pill, a white tab on grey, an indigo card, a flat primary tab); this
   * is the one way. The selection is primary, the rest is quiet text.
   *
   * Semantically a radio group: arrow keys move the selection, Tab enters
   * and leaves the group as one stop, and each option says whether it is
   * checked. On a touch screen every option is at least 44px tall.
   *
   * `fullWidth` spreads the options across the container on a phone (an
   * equal-column grid) and lets them size to their label from `sm` up —
   * the period selector needs it, a two-option toggle does not.
   *
   * `scrollable` keeps the options on one line that scrolls sideways, with
   * a fade on the right edge saying there is more — for a band of months
   * that must not wrap into three rows on a phone.
   *
   * `semantics="tablist"` is for the case where each option shows its own
   * panel rather than re-reading the same one: the options become tabs,
   * each naming its panel through `controls` (and `id` for the panel's
   * `aria-labelledby`). The keyboard behaves the same.
   */
  export interface SegmentedOption<V> {
    value: V
    label: string
    /** A shorter label for phones, when the full one does not fit five across. */
    shortLabel?: string
    testId?: string
    disabled?: boolean
    title?: string
    /** tablist only: the id of the panel this option shows. */
    controls?: string
    /** tablist only: the id of the tab, for the panel's aria-labelledby. */
    id?: string
  }

  const props = withDefaults(
    defineProps<{
      options: SegmentedOption<T>[]
      /** The group's accessible name. Use `labelledBy` when a visible caption names it. */
      label?: string | undefined
      labelledBy?: string | undefined
      size?: 'sm' | 'md' | undefined
      fullWidth?: boolean | undefined
      disabled?: boolean | undefined
      semantics?: 'radiogroup' | 'tablist' | undefined
      scrollable?: boolean | undefined
    }>(),
    {
      label: undefined,
      labelledBy: undefined,
      size: 'md',
      fullWidth: false,
      disabled: false,
      semantics: 'radiogroup',
      scrollable: false,
    }
  )

  const model = defineModel<T>({ required: true })

  const groupRef = ref<HTMLElement | null>(null)

  const SIZES: Record<NonNullable<typeof props.size>, string> = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
  }

  const selectedIndex = computed(() =>
    props.options.findIndex(option => option.value === model.value)
  )

  function isSelected(option: SegmentedOption<T>): boolean {
    return option.value === model.value
  }

  function select(option: SegmentedOption<T>): void {
    if (props.disabled || option.disabled) return
    model.value = option.value
  }

  /**
   * Roving tabindex: the selected option is the group's one tab stop
   * (the first enabled one when nothing is selected yet).
   */
  function tabIndexFor(index: number): 0 | -1 {
    if (selectedIndex.value >= 0) return index === selectedIndex.value ? 0 : -1
    const firstEnabled = props.options.findIndex(option => !option.disabled)
    return index === firstEnabled ? 0 : -1
  }

  function move(from: number, step: 1 | -1): void {
    const count = props.options.length
    if (count === 0) return
    let index = from
    for (let i = 0; i < count; i += 1) {
      index = (index + step + count) % count
      const candidate = props.options[index]
      if (candidate && !candidate.disabled) {
        select(candidate)
        focusOption(index)
        return
      }
    }
  }

  function jump(to: 'first' | 'last'): void {
    const enabled = props.options
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => !option.disabled)
    const target = to === 'first' ? enabled[0] : enabled[enabled.length - 1]
    if (!target) return
    select(target.option)
    focusOption(target.index)
  }

  function focusOption(index: number): void {
    const buttons = groupRef.value?.querySelectorAll<HTMLButtonElement>(
      '[role="radio"], [role="tab"]'
    )
    buttons?.[index]?.focus()
  }

  function onKeydown(event: KeyboardEvent, index: number): void {
    if (props.disabled) return
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        move(index, 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        move(index, -1)
        break
      case 'Home':
        event.preventDefault()
        jump('first')
        break
      case 'End':
        event.preventDefault()
        jump('last')
        break
      default:
        break
    }
  }
</script>

<template>
  <div
    ref="groupRef"
    :role="semantics"
    :aria-label="label"
    :aria-labelledby="labelledBy"
    :aria-disabled="disabled ? true : undefined"
    class="rounded-lg bg-gray-100 p-1 dark:bg-slate-700/50"
    :class="[
      scrollable
        ? 'relative flex max-w-full flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden after:pointer-events-none after:sticky after:right-0 after:-ml-6 after:w-6 after:shrink-0 after:bg-gradient-to-l after:from-gray-100 after:to-transparent after:content-[\'\'] dark:after:from-slate-800'
        : fullWidth
          ? 'grid auto-cols-fr grid-flow-col sm:inline-flex sm:flex-wrap'
          : 'inline-flex flex-wrap',
      disabled ? 'opacity-50' : '',
    ]"
    :data-scrollable="scrollable ? 'true' : undefined"
  >
    <button
      v-for="(option, index) in options"
      :id="option.id"
      :key="String(option.value)"
      type="button"
      :role="semantics === 'tablist' ? 'tab' : 'radio'"
      :aria-checked="semantics === 'tablist' ? undefined : isSelected(option)"
      :aria-selected="semantics === 'tablist' ? isSelected(option) : undefined"
      :aria-controls="option.controls"
      :tabindex="tabIndexFor(index)"
      :disabled="disabled || option.disabled"
      :data-testid="option.testId"
      :title="option.title"
      class="min-w-0 rounded-md font-medium whitespace-nowrap transition-colors pointer-coarse:min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed dark:focus-visible:ring-offset-slate-800"
      :class="[
        SIZES[size],
        isSelected(option)
          ? 'bg-primary-600 text-white shadow-sm'
          : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200',
      ]"
      @click="select(option)"
      @keydown="onKeydown($event, index)"
    >
      <template v-if="option.shortLabel">
        <span class="hidden sm:inline">{{ option.label }}</span>
        <span class="sm:hidden">{{ option.shortLabel }}</span>
      </template>
      <template v-else>{{ option.label }}</template>
      <slot name="option" :option="option" />
    </button>
  </div>
</template>
