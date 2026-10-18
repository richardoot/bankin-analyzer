<script setup lang="ts">
  import { ref, useId, watch } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import ConfirmByTyping from '@/components/ui/ConfirmByTyping.vue'
  import IconWarning from '@/components/icons/IconWarning.vue'

  /**
   * A destructive yes/no question, asked the same way everywhere: warning
   * icon, centered question, quiet cancel on the left, red confirm on the
   * right. The message slot carries the sentence (with any emphasized
   * names); everything else is decided here once.
   *
   * `typedConfirmation` turns the question into a brake: the confirm button
   * stays locked until that text is typed back. For the few deletions that
   * cannot be undone and are easy to aim wrong — an account, a category —
   * not for every « Supprimer ? ».
   */
  const props = withDefaults(
    defineProps<{
      open: boolean
      title: string
      confirmLabel?: string
      cancelLabel?: string
      loading?: boolean
      /** A text to type back before the confirm button unlocks. */
      typedConfirmation?: string | undefined
    }>(),
    {
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      loading: false,
      typedConfirmation: undefined,
    }
  )

  const emit = defineEmits<{ confirm: []; cancel: [] }>()

  // The question is the dialog's name: a screen reader announces it on open.
  const titleId = useId()

  const typedOk = ref(false)

  watch(
    () => props.open,
    open => {
      if (!open) typedOk.value = false
    }
  )

  function confirm(): void {
    if (props.typedConfirmation && !typedOk.value) return
    emit('confirm')
  }
</script>

<template>
  <BaseModal
    :open="open"
    :closable="!loading"
    :labelled-by="titleId"
    max-width="md"
    @close="emit('cancel')"
  >
    <div class="mb-4 flex justify-center">
      <div
        class="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
      >
        <IconWarning class="h-6 w-6 text-red-600 dark:text-red-400" />
      </div>
    </div>

    <h3
      :id="titleId"
      class="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100"
    >
      {{ title }}
    </h3>

    <p class="text-center text-gray-600 dark:text-gray-400">
      <slot />
    </p>

    <div v-if="typedConfirmation" class="mt-4">
      <ConfirmByTyping
        v-model:confirmed="typedOk"
        :expected="typedConfirmation"
        :disabled="loading"
        data-testid="confirm-typed"
        @submit="confirm"
      />
    </div>

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
        :disabled="typedConfirmation !== undefined && !typedOk"
        data-testid="confirm-dialog-confirm"
        @click="confirm"
      >
        {{ confirmLabel }}
      </BaseButton>
    </template>
  </BaseModal>
</template>
