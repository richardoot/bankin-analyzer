<script setup lang="ts">
  /**
   * The first half of a password reset: an address, and an e-mail on its
   * way. The answer never says whether the address is known — that would
   * tell a stranger who has an account here.
   */
  import { ref, computed } from 'vue'
  import { RouterLink } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'
  import PageShell from '@/components/ui/PageShell.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import IconArrowLeft from '@/components/icons/IconArrowLeft.vue'

  const authStore = useAuthStore()

  const email = ref('')
  const localError = ref<string | null>(null)
  const sent = ref(false)

  const error = computed(() => localError.value || authStore.error)
  const loading = computed(() => authStore.loading)

  async function handleSubmit(): Promise<void> {
    localError.value = null
    authStore.clearError()
    if (!email.value.trim()) {
      localError.value = 'Indiquez votre adresse e-mail'
      return
    }
    try {
      await authStore.requestPasswordReset(email.value.trim())
      sent.value = true
    } catch {
      // Said by the store.
    }
  }
</script>

<template>
  <PageShell width="narrow" center>
    <div class="mx-auto w-full max-w-md">
      <BaseCard variant="raised" padding="lg">
        <div class="mb-8 text-center">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Mot de passe oublié
          </h1>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            Indiquez votre adresse : vous recevrez un lien pour choisir un
            nouveau mot de passe.
          </p>
        </div>

        <InlineAlert
          v-if="sent"
          variant="success"
          data-testid="forgot-password-sent"
        >
          Si un compte existe pour cette adresse, un e-mail vient de partir.
          Ouvrez le lien qu'il contient pour choisir votre nouveau mot de passe
          ; pensez au dossier spam s'il tarde.
        </InlineAlert>

        <form v-else class="space-y-6" @submit.prevent="handleSubmit">
          <InlineAlert v-if="error" data-testid="forgot-password-error">
            {{ error }}
          </InlineAlert>

          <BaseField
            v-model="email"
            label="E-mail"
            type="email"
            required
            autocomplete="email"
            placeholder="vous@exemple.com"
            data-testid="forgot-password-email"
          />

          <BaseButton
            type="submit"
            block
            class="py-3"
            :loading="loading"
            data-testid="forgot-password-submit"
          >
            Envoyer le lien
          </BaseButton>
        </form>
      </BaseCard>

      <div class="mt-6 text-center">
        <RouterLink
          to="/login"
          class="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-primary-700 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
        >
          <IconArrowLeft class="h-4 w-4" />
          Retour à la connexion
        </RouterLink>
      </div>
    </div>
  </PageShell>
</template>
