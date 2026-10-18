<script setup lang="ts">
  import BaseCard from '@/components/ui/BaseCard.vue'
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
  <BaseCard as="section" variant="raised" padding="lg">
    <div class="mb-5 flex flex-wrap items-start justify-between gap-4 sm:mb-6">
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
  </BaseCard>
</template>
