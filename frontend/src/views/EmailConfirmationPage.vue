<script setup lang="ts">
  /**
   * The wait after signing up. « Renvoyer l'e-mail » asks Supabase for
   * the confirmation again, then rests for a minute: a second click in
   * that minute would only queue a second identical e-mail.
   */
  import { computed, onBeforeUnmount, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'
  import PageShell from '@/components/ui/PageShell.vue'
  import IconArrowLeft from '@/components/icons/IconArrowLeft.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'

  const RESEND_COOLDOWN_SECONDS = 60

  const route = useRoute()
  const authStore = useAuthStore()
  const email = route.query.email as string | undefined

  const isResending = ref(false)
  const resendError = ref<string | null>(null)
  const resentAt = ref<number | null>(null)
  const cooldown = ref(0)
  let ticker: ReturnType<typeof setInterval> | null = null

  const canResend = computed(
    () => !!email && !isResending.value && cooldown.value === 0
  )

  function startCooldown(): void {
    cooldown.value = RESEND_COOLDOWN_SECONDS
    ticker = setInterval(() => {
      cooldown.value -= 1
      if (cooldown.value <= 0 && ticker) {
        clearInterval(ticker)
        ticker = null
        cooldown.value = 0
      }
    }, 1000)
  }

  async function resend(): Promise<void> {
    if (!email || !canResend.value) return
    isResending.value = true
    resendError.value = null
    try {
      await authStore.resendConfirmation(email)
      resentAt.value = Date.now()
      startCooldown()
    } catch (err) {
      resendError.value =
        err instanceof Error ? err.message : "L'e-mail n'a pas pu être renvoyé"
    } finally {
      isResending.value = false
    }
  }

  onBeforeUnmount(() => {
    if (ticker) clearInterval(ticker)
  })
</script>

<template>
  <PageShell width="narrow" center>
    <div class="mx-auto w-full max-w-md text-center">
      <BaseCard variant="raised" padding="lg">
        <!-- Icon -->
        <div
          class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30"
        >
          <svg
            class="h-10 w-10 text-primary-700 dark:text-primary-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>

        <h1 class="mt-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
          Vérifiez votre boîte mail
        </h1>

        <p class="mt-4 text-gray-600 dark:text-gray-400">
          Nous avons envoyé un lien de confirmation à
          <span
            v-if="email"
            class="font-medium text-gray-900 dark:text-gray-100"
            >{{ email }}</span
          >
          <span v-else>votre adresse e-mail</span>.
        </p>

        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Ouvrez le lien dans l'e-mail pour activer votre compte.
        </p>

        <InlineAlert variant="info" class="mt-6 text-left">
          Si vous ne trouvez pas l'e-mail, vérifiez votre dossier spam.
        </InlineAlert>

        <!-- Resend -->
        <div v-if="email" class="mt-6 space-y-3">
          <InlineAlert
            v-if="resentAt"
            variant="success"
            class="text-left"
            data-testid="email-resent"
          >
            E-mail renvoyé. Il peut mettre une minute à arriver.
          </InlineAlert>
          <InlineAlert
            v-if="resendError"
            class="text-left"
            data-testid="email-resend-error"
          >
            {{ resendError }}
          </InlineAlert>
          <BaseButton
            variant="secondary"
            block
            :disabled="!canResend"
            :loading="isResending"
            data-testid="email-resend"
            @click="resend"
          >
            <template v-if="cooldown > 0">
              Renvoyer l'e-mail ({{ cooldown }} s)
            </template>
            <template v-else>Renvoyer l'e-mail</template>
          </BaseButton>
        </div>

        <!-- Back to login -->
        <div class="mt-8">
          <RouterLink
            to="/login"
            class="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-primary-700 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
          >
            <IconArrowLeft class="h-4 w-4" />
            Retour à la connexion
          </RouterLink>
        </div>
      </BaseCard>
    </div>
  </PageShell>
</template>
