<script setup lang="ts">
  /**
   * Small colored pill representing a tag. The tag color (when set) tints a
   * leading dot; an optional remove button emits `remove`.
   */
  withDefaults(
    defineProps<{
      name: string
      color?: string | null
      icon?: string | null
      removable?: boolean
      /** Smaller variant for dense transaction rows. */
      dense?: boolean
    }>(),
    {
      color: null,
      icon: null,
      removable: false,
      dense: false,
    }
  )

  const emit = defineEmits<{
    (e: 'remove'): void
  }>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 font-medium text-gray-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
    :class="dense ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'"
  >
    <span
      v-if="icon"
      class="leading-none"
      :class="dense ? 'text-[10px]' : 'text-xs'"
      >{{ icon }}</span
    >
    <span
      v-else
      class="inline-block rounded-full"
      :class="dense ? 'h-1.5 w-1.5' : 'h-2 w-2'"
      :style="{ backgroundColor: color ?? '#9ca3af' }"
    ></span>
    <span class="max-w-[10rem] truncate">{{ name }}</span>
    <button
      v-if="removable"
      type="button"
      class="ml-0.5 rounded-full text-gray-400 hover:text-red-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 dark:text-slate-400"
      :aria-label="`Retirer l'étiquette ${name}`"
      @click.stop="emit('remove')"
    >
      <svg
        class="h-3 w-3"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
  </span>
</template>
