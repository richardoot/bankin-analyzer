<script setup lang="ts">
  /**
   * An empty screen always answers two questions: why is it empty, and what
   * do I do about it. The #icon slot takes an svg; the #action slot takes a
   * button or link — a screen with no way out is the bug this component
   * exists to prevent.
   */
  defineProps<{
    title: string
    description?: string | undefined
  }>()
</script>

<template>
  <div class="py-12 text-center">
    <div
      v-if="$slots.icon"
      class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-gray-500"
    >
      <slot name="icon" />
    </div>
    <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">
      {{ title }}
    </h3>
    <p
      v-if="description"
      class="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400"
    >
      {{ description }}
    </p>
    <div v-if="$slots.action" class="mt-4 flex justify-center gap-3">
      <slot name="action" />
    </div>
  </div>
</template>
