<script setup lang="ts">
  import { onMounted, ref } from 'vue'

  /**
   * Rename a recurring charge in place. Its name was read from its bank
   * labels ("CB Strava Ireland Li" is Strava); the user's name replaces it
   * everywhere, and "Nom d'origine" gives the labels' one back.
   */
  const props = defineProps<{
    name: string
    /** The current name is the user's, so there is one to give back. */
    named: boolean
    saving?: boolean | undefined
  }>()

  const emit = defineEmits<{
    save: [name: string | null]
    cancel: []
  }>()

  const draft = ref(props.name)
  const input = ref<HTMLInputElement | null>(null)
  onMounted(() => input.value?.select())

  function submit(): void {
    const name = draft.value.trim()
    emit('save', name === '' ? null : name)
  }
</script>

<template>
  <form
    class="flex min-w-0 flex-1 flex-wrap items-center gap-2"
    data-testid="recurrence-name-editor"
    @submit.prevent="submit"
    @keydown.esc.prevent="emit('cancel')"
  >
    <input
      ref="input"
      v-model="draft"
      type="text"
      maxlength="60"
      aria-label="Nom de l'abonnement"
      class="min-h-[44px] min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-100"
      data-testid="recurrence-name-input"
    />
    <button
      type="submit"
      class="min-h-[44px] rounded-lg bg-primary-500 px-3 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50"
      :disabled="saving"
      data-testid="recurrence-name-save"
    >
      OK
    </button>
    <button
      v-if="named"
      type="button"
      class="min-h-[44px] rounded-lg px-2 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-slate-800"
      :disabled="saving"
      data-testid="recurrence-name-reset"
      @click="emit('save', null)"
    >
      Nom d'origine
    </button>
    <button
      type="button"
      class="min-h-[44px] rounded-lg px-2 text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800"
      @click="emit('cancel')"
    >
      Annuler
    </button>
  </form>
</template>
