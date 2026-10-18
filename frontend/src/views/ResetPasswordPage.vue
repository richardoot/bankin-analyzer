<script setup lang="ts">
  /**
   * Where the recovery link lands. Supabase has already opened a session
   * from the link's token by the time this renders (the store raises
   * `passwordRecovery` on its PASSWORD_RECOVERY event); all that is left
   * is to choose the new password, then carry on signed in. Without a
   * session the link was consumed or has expired, and the page says so.
   */
  import { ref, computed } from 'vue'
  import { RouterLink, useRouter } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'
  import { useToast } from '@/composables/useToast'
  import PageShell from '@/components/ui/PageShell.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'

  const MIN_LENGTH = 6

  const router = useRouter()
  const authStore = useAuthStore()
  const toast = useToast()

  const password = ref('')
  const confirmPassword = ref('')
  const localError = ref<string | null>(null)

  const error = computed(() => localError.value || authStore.error)
  const loading = computed(() => authStore.loading)
  const canChange = computed(() => authStore.isAuthenticated)

  async function handleSubmit(): Promise<void> {
    localError.value = null
    authStore.clearError()
    if (password.value.length < MIN_LENGTH) {
      localError.value = `Le mot de passe doit contenir au moins ${MIN_LENGTH} caractères`
      return
    }
    if (password.value !== confirmPassword.value) {
      localError.value = 'Les deux mots de passe ne correspondent pas'
      return
    }
    try {
      await authStore.updatePassword(password.value)
      toast.success('Mot de passe modifié, vous êtes connecté.')
      await router.push('/dashboard')
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
            Nouveau mot de passe
          </h1>
          <p
            v-if="canChange"
            class="mt-2 text-gray-600 dark:text-gray-400"
            data-testid="reset-password-intro"
          >
            <template v-if="authStore.passwordRecovery">
              Le lien a bien été reconnu : choisissez votre nouveau mot de
              passe.
            </template>
            <template v-else>
              Choisissez le mot de passe qui remplacera l'actuel.
            </template>
          </p>
        </div>

        <InlineAlert
          v-if="!canChange"
          variant="warning"
          data-testid="reset-password-expired"
        >
          Ce lien n'est plus valide : il a déjà servi ou a expiré.
          <RouterLink
            to="/forgot-password"
            class="font-medium underline underline-offset-2"
          >
            Demander un nouveau lien
          </RouterLink>
        </InlineAlert>

        <form v-else class="space-y-6" @submit.prevent="handleSubmit">
          <InlineAlert v-if="error" data-testid="reset-password-error">
            {{ error }}
          </InlineAlert>

          <BaseField
            v-model="password"
            label="Nouveau mot de passe"
            type="password"
            required
            autocomplete="new-password"
            placeholder="••••••••"
            :hint="`Au moins ${MIN_LENGTH} caractères`"
            data-testid="reset-password-input"
          />

          <BaseField
            v-model="confirmPassword"
            label="Confirmer le mot de passe"
            type="password"
            required
            autocomplete="new-password"
            placeholder="••••••••"
            data-testid="reset-password-confirm"
          />

          <BaseButton
            type="submit"
            block
            class="py-3"
            :loading="loading"
            data-testid="reset-password-submit"
          >
            Enregistrer le mot de passe
          </BaseButton>
        </form>
      </BaseCard>
    </div>
  </PageShell>
</template>
