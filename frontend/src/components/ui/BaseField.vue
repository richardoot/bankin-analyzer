<script setup lang="ts">
  import { computed, ref, useId, watch } from 'vue'
  import { parseDecimal } from '@/lib/formatters'

  /**
   * A labeled field whose error is wired for everyone: the label points at
   * the field, the field names its error via aria-describedby, and the
   * error is announced when it appears. Extra attributes (type,
   * placeholder, data-testid, autocomplete, min, step…) fall through to
   * the control.
   *
   * One brick, three controls: `as="input"` (the default — text, date,
   * search, password, email through `type`), `as="select"` with the
   * options in the default slot, `as="textarea"`. An `amount` field is a
   * text input with a decimal keyboard whose model is a number (or null
   * when empty), read through parseDecimal so « 12,5 » is 12.5 and not
   * zero on Safari.
   *
   * `size="sm"` is the compact field of a settings form or a filter bar;
   * on a phone it still types at 16px so iOS does not zoom in.
   * `labelHidden` keeps the label for assistive technology only, for a
   * control whose purpose its neighbour already states.
   */
  defineOptions({ inheritAttrs: false })

  const props = withDefaults(
    defineProps<{
      label: string
      labelHidden?: boolean | undefined
      error?: string | undefined
      hint?: string | undefined
      size?: 'sm' | 'md' | undefined
      as?: 'input' | 'select' | 'textarea' | undefined
      amount?: boolean | undefined
    }>(),
    {
      labelHidden: false,
      error: undefined,
      hint: undefined,
      size: 'md',
      as: 'input',
      amount: false,
    }
  )

  const model = defineModel<string | number | null>({ default: '' })
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  const describedBy = computed(() => {
    const ids = [props.error ? errorId : null, props.hint ? hintId : null]
    const joined = ids.filter(Boolean).join(' ')
    return joined || undefined
  })

  // Amount mode keeps what the user typed (« 12,5 ») and hands the parent
  // the number; an outside change (a reset, a suggestion) rewrites the text.
  function toText(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return ''
    return String(value).replace('.', ',')
  }

  const amountText = ref(toText(model.value))

  watch(model, next => {
    if (!props.amount) return
    const typed = parseDecimal(amountText.value)
    const same =
      (next === null && Number.isNaN(typed)) ||
      (typeof next === 'number' && typed === next)
    if (!same) amountText.value = toText(next)
  })

  function onAmountInput(event: Event): void {
    amountText.value = (event.target as HTMLInputElement).value
    const parsed = parseDecimal(amountText.value)
    model.value = Number.isNaN(parsed) ? null : parsed
  }

  const CONTROL_SIZES: Record<NonNullable<typeof props.size>, string> = {
    sm: 'px-3 py-2 text-base sm:text-sm',
    md: 'px-4 py-3 text-base',
  }

  const controlClass = computed(() => [
    'block w-full rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-500 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid]:border-red-500 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-primary-400',
    CONTROL_SIZES[props.size],
    props.labelHidden ? '' : 'mt-1',
  ])

  const labelClass = computed(() => [
    props.labelHidden ? 'sr-only' : 'block font-medium',
    props.size === 'sm'
      ? 'text-xs text-gray-600 dark:text-gray-400'
      : 'text-sm text-gray-700 dark:text-gray-300',
  ])
</script>

<template>
  <div>
    <label :for="id" :class="labelClass">
      {{ label }}
    </label>
    <select
      v-if="as === 'select'"
      :id="id"
      v-model="model"
      v-bind="$attrs"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
      :class="controlClass"
    >
      <slot />
    </select>
    <textarea
      v-else-if="as === 'textarea'"
      :id="id"
      v-model="model"
      v-bind="$attrs"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
      :class="controlClass"
    />
    <input
      v-else-if="amount"
      :id="id"
      type="text"
      inputmode="decimal"
      v-bind="$attrs"
      :value="amountText"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
      :class="controlClass"
      @input="onAmountInput"
    />
    <input
      v-else
      :id="id"
      v-model="model"
      v-bind="$attrs"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
      :class="controlClass"
    />
    <p
      v-if="hint && !error"
      :id="hintId"
      class="mt-1.5 text-xs text-gray-500 dark:text-gray-400"
    >
      {{ hint }}
    </p>
    <p
      v-if="error"
      :id="errorId"
      aria-live="polite"
      class="mt-1.5 text-sm text-red-600 dark:text-red-400"
    >
      {{ error }}
    </p>
  </div>
</template>
