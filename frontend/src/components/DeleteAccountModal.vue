<script setup lang="ts">
  import { ref, watch } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import ConfirmByTyping from '@/components/ui/ConfirmByTyping.vue'

  const props = defineProps<{
    isOpen: boolean
    loading: boolean
  }>()

  const emit = defineEmits<{
    close: []
    confirm: []
  }>()

  const CONFIRMATION_WORD = 'SUPPRIMER'
  const isConfirmationValid = ref(false)

  // The word typed on a previous opening must not unlock the next one.
  watch(
    () => props.isOpen,
    open => {
      if (!open) isConfirmationValid.value = false
    }
  )

  function handleClose(): void {
    emit('close')
  }

  function handleConfirm(): void {
    if (isConfirmationValid.value) {
      emit('confirm')
    }
  }
</script>

<template>
  <BaseModal
    :open="isOpen"
    title="Supprimer mon compte"
    tone="danger"
    max-width="md"
    :closable="!props.loading"
    @close="handleClose"
  >
    <div class="mb-6 space-y-3 text-sm text-gray-600 dark:text-gray-400">
      <p>
        Cette action est
        <strong class="text-red-600 dark:text-red-400">irréversible</strong>.
      </p>
      <p>En supprimant votre compte :</p>
      <ul class="list-inside list-disc space-y-1 pl-2">
        <li>Toutes vos données seront définitivement supprimées</li>
        <li>Vous ne pourrez plus accéder à votre historique</li>
        <li>Cette action ne peut pas être annulée</li>
      </ul>
    </div>

    <ConfirmByTyping
      v-if="isOpen"
      v-model:confirmed="isConfirmationValid"
      :expected="CONFIRMATION_WORD"
      :disabled="loading"
      data-testid="delete-account-confirmation"
      @submit="handleConfirm"
    />

    <template #footer>
      <BaseButton
        variant="secondary"
        class="flex-1"
        :disabled="loading"
        @click="handleClose"
      >
        Annuler
      </BaseButton>
      <BaseButton
        variant="danger"
        class="flex-1"
        :disabled="!isConfirmationValid"
        :loading="loading"
        @click="handleConfirm"
      >
        Supprimer définitivement
      </BaseButton>
    </template>
  </BaseModal>
</template>
