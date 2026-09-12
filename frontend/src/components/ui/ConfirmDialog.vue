<script setup lang="ts">
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'

  /**
   * A destructive yes/no question, asked the same way everywhere: warning
   * icon, centered question, quiet cancel on the left, red confirm on the
   * right. The message slot carries the sentence (with any emphasized
   * names); everything else is decided here once.
   */
  withDefaults(
    defineProps<{
      open: boolean
      title: string
      confirmLabel?: string
      cancelLabel?: string
      loading?: boolean
    }>(),
    {
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      loading: false,
    }
  )

  const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <BaseModal
    :open="open"
    :closable="!loading"
    max-width="md"
    @close="emit('cancel')"
  >
    <div class="flex justify-center mb-4">
      <div
        class="h-12 w-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center"
      >
        <svg
          class="h-6 w-6 text-red-600 dark:text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
    </div>

    <h3
      class="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2"
    >
      {{ title }}
    </h3>

    <p class="text-gray-600 dark:text-gray-400 text-center">
      <slot />
    </p>

    <template #footer>
      <BaseButton
        variant="secondary"
        class="flex-1"
        :disabled="loading"
        @click="emit('cancel')"
      >
        {{ cancelLabel }}
      </BaseButton>
      <BaseButton
        variant="danger"
        class="flex-1"
        :loading="loading"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </BaseButton>
    </template>
  </BaseModal>
</template>
