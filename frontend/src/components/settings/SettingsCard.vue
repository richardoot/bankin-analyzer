<script setup lang="ts">
  /**
   * The one card shape every settings section uses: title, optional
   * description, an optional action slot in the header, then the content.
   * Keeping it here is what makes the three tabs look like one page.
   */
  defineProps<{
    title: string
    description?: string
  }>()
</script>

<template>
  <section
    class="rounded-2xl bg-white p-6 shadow-lg sm:p-8 dark:bg-slate-900 dark:shadow-slate-900/20"
  >
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {{ title }}
        </h2>
        <p
          v-if="description"
          class="mt-1 text-sm text-gray-600 dark:text-gray-400"
        >
          {{ description }}
        </p>
      </div>
      <slot name="action" />
    </div>

    <slot />
  </section>
</template>
