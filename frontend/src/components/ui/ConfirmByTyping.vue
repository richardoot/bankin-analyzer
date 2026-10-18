<script lang="ts">
  /**
   * Whether what was typed is the expected text: compared trimmed and
   * case-insensitively, because the guard is about aiming at the right
   * thing, not about typing accuracy.
   */
  export function matchesTypedConfirmation(
    typed: string,
    expected: string
  ): boolean {
    const wanted = expected.trim().toLocaleLowerCase('fr')
    if (!wanted) return false
    return typed.trim().toLocaleLowerCase('fr') === wanted
  }
</script>

<script setup lang="ts">
  import { ref, useId, watch } from 'vue'

  /**
   * The brake before an irreversible deletion: the name of what is about
   * to go, typed back. Three dialogs spelled this field by hand; the label,
   * the red focus ring and the comparison rule live here now.
   *
   * `confirmed` (v-model) tells the dialog whether its red button may
   * unlock. The text resets whenever `expected` changes, so a dialog
   * pointed at another item starts locked again. Enter emits `submit` for
   * the dialog to act on when the text matches.
   */
  defineOptions({ inheritAttrs: false })

  const props = withDefaults(
    defineProps<{
      /** The text to type back — a name, or a word like SUPPRIMER. */
      expected: string
      disabled?: boolean | undefined
    }>(),
    { disabled: false }
  )

  const emit = defineEmits<{ submit: [] }>()

  const confirmed = defineModel<boolean>('confirmed', { default: false })

  const typed = ref('')
  const id = useId()

  watch(
    () => props.expected,
    () => {
      typed.value = ''
    }
  )

  watch(
    [typed, () => props.expected],
    ([text, expected]) => {
      confirmed.value = matchesTypedConfirmation(text, expected)
    },
    { immediate: true }
  )

  function onEnter(): void {
    if (confirmed.value) emit('submit')
  }
</script>

<template>
  <div>
    <label
      :for="id"
      class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
    >
      Tapez
      <strong class="text-red-600 dark:text-red-400">{{ expected }}</strong>
      pour confirmer
    </label>
    <input
      :id="id"
      v-model="typed"
      type="text"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      :placeholder="expected"
      :disabled="disabled"
      v-bind="$attrs"
      class="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-primary-400"
      @keyup.enter="onEnter"
    />
  </div>
</template>
