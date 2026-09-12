<script setup lang="ts">
  /**
   * The inline note editor, declared once for both layouts. `dense` is the
   * mobile fit (smaller text, placeholder); the behavior — Enter saves,
   * Escape cancels, the two buttons — is identical by construction.
   */
  withDefaults(
    defineProps<{
      dense?: boolean | undefined
    }>(),
    { dense: false }
  )

  const emit = defineEmits<{ save: []; cancel: [] }>()

  const model = defineModel<string>({ default: '' })
</script>

<template>
  <div class="flex items-center gap-1.5">
    <input
      v-model="model"
      type="text"
      :placeholder="dense ? 'Ajouter une note...' : undefined"
      class="flex-1 border border-primary-300 dark:border-primary-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary-500"
      :class="dense ? 'px-2.5 py-1.5 text-xs' : 'px-2 py-1 text-sm rounded'"
      @keyup.enter="emit('save')"
      @keyup.escape="emit('cancel')"
    />
    <button
      class="p-1.5 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20"
      title="Sauvegarder"
      @click="emit('save')"
    >
      <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
        <path
          fill-rule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
    <button
      class="p-1.5 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
      title="Annuler"
      @click="emit('cancel')"
    >
      <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
        <path
          fill-rule="evenodd"
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
  </div>
</template>
