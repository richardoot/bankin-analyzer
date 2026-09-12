<script setup lang="ts">
  import { ref, computed } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'

  const props = defineProps<{
    isOpen: boolean
    loading: boolean
  }>()

  const emit = defineEmits<{
    close: []
    confirm: []
  }>()

  const confirmationText = ref('')
  const CONFIRMATION_WORD = 'SUPPRIMER'

  const isConfirmationValid = computed(
    () => confirmationText.value === CONFIRMATION_WORD
  )

  function handleClose(): void {
    confirmationText.value = ''
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
    :closable="!props.loading"
    max-width="md"
    @close="handleClose"
  >
    <template #header>
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
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
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Supprimer mon compte
        </h2>
      </div>
    </template>

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

    <div>
      <label
        for="confirmation"
        class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        Tapez
        <strong class="text-red-600 dark:text-red-400">{{
          CONFIRMATION_WORD
        }}</strong>
        pour confirmer
      </label>
      <input
        id="confirmation"
        v-model="confirmationText"
        type="text"
        class="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-4 py-2 focus:border-red-500 dark:focus:border-red-400 focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:outline-none"
        placeholder="Tapez SUPPRIMER"
        :disabled="loading"
      />
    </div>

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
        {{ loading ? 'Suppression...' : 'Supprimer définitivement' }}
      </BaseButton>
    </template>
  </BaseModal>
</template>
