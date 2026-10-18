<script setup lang="ts">
  import { RouterLink, type RouteLocationRaw } from 'vue-router'
  import IconArrowLeft from '@/components/icons/IconArrowLeft.vue'

  /**
   * The way back up a flow, said before the title: « ← Comptes » on the
   * import, the recap and the two histories, so none of them is a dead end
   * that only the browser's back button leaves. A 44px target on a phone.
   */
  defineProps<{ to: RouteLocationRaw }>()
</script>

<template>
  <RouterLink
    :to="to"
    class="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 sm:min-h-0 dark:text-gray-400 dark:hover:text-gray-200"
    data-testid="back-link"
  >
    <IconArrowLeft class="h-4 w-4" />
    <slot />
  </RouterLink>
</template>
