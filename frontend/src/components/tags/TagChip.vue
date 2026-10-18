<script setup lang="ts">
  /**
   * Small colored pill representing a tag. The tag color (when set) tints a
   * leading dot; an optional remove button emits `remove`.
   *
   * `dense` is the fit of a transaction row: tighter padding, but the
   * text stays 12px — it was 10px, unreadable on a phone — and the cross
   * keeps a 44px halo under a thumb however small it is drawn.
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
    class="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 font-medium text-gray-700 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-200"
    :class="dense ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs'"
  >
    <span v-if="icon" class="text-xs leading-none">{{ icon }}</span>
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
      class="relative -my-1 -mr-1 ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 pointer-coarse:before:absolute pointer-coarse:before:-inset-3 pointer-coarse:before:content-[''] dark:text-gray-400 dark:hover:bg-slate-600"
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
