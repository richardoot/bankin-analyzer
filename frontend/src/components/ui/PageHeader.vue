<script setup lang="ts">
  /**
   * The one way a page introduces itself. Before it existed, page titles
   * drifted between text-2xl and text-3xl depending on the screen; the
   * scale now lives here and nowhere else.
   *
   * #meta renders under the subtitle (badges, plan dates); #actions sits to
   * the right and wraps under the title on narrow screens.
   */
  defineProps<{
    title: string
    subtitle?: string
  }>()
</script>

<template>
  <div
    class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
  >
    <div class="min-w-0">
      <h1
        class="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-gray-100"
      >
        {{ title }}
      </h1>
      <p
        v-if="subtitle"
        class="mt-2 text-sm text-gray-600 sm:text-base dark:text-gray-400"
      >
        {{ subtitle }}
      </p>
      <slot name="meta" />
    </div>
    <div
      v-if="$slots.actions"
      class="flex shrink-0 flex-wrap items-center gap-2"
    >
      <slot name="actions" />
    </div>
  </div>
</template>
