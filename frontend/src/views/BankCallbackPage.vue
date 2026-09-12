<script setup lang="ts">
  /**
   * Where the bank sends the browser back, and where the authorization ends.
   *
   * The code it carries is single-use and short-lived, so the exchange happens
   * on arrival rather than behind a button — a page that waited for a click
   * would routinely be clicked too late.
   *
   * The page is public. The redirect arrives from the bank in whatever session
   * state the browser was left in, and bouncing it to the login screen would
   * drop the code from the URL, which is the one thing the redirect carries.
   * The request that follows still needs a session; failing on that is a
   * different message from losing the code before anyone could use it.
   */
  import { onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { api } from '@/lib/api'

  const route = useRoute()
  const router = useRouter()

  const state = ref<'working' | 'done' | 'failed' | 'nothing'>('working')
  const bank = ref<string | null>(null)
  const message = ref<string | null>(null)

  onMounted(async () => {
    const code = route.query.code as string | undefined
    const bankError = route.query.error as string | undefined
    // The same value `startBankAuthorization` returned, echoed back by the
    // bank alongside `code` — lets the backend recognise a connection already
    // made even if the bank names itself differently between the two calls.
    const oauthState = route.query.state as string | undefined

    if (!code) {
      state.value = 'nothing'
      message.value = bankError ?? null
      return
    }

    try {
      const connection = await api.completeBankAuthorization(code, oauthState)
      bank.value = connection.aspspName
      state.value = 'done'
      // Long enough to read what happened, short enough not to be a wait.
      setTimeout(() => void router.push('/settings/accounts'), 1500)
    } catch (err) {
      state.value = 'failed'
      message.value =
        err instanceof Error ? err.message : 'Autorisation impossible'
    }
  })
</script>

<template>
  <div
    class="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gray-50 px-4 transition-colors dark:bg-slate-800"
  >
    <div class="w-full max-w-md text-center">
      <div
        class="rounded-2xl bg-white p-8 shadow-lg dark:bg-slate-900 dark:shadow-slate-900/20"
      >
        <template v-if="state === 'working'">
          <h1
            class="text-xl font-semibold text-gray-900 dark:text-gray-100"
            data-testid="callback-working"
          >
            Connexion en cours…
          </h1>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            Nous terminons l'autorisation auprès de votre banque.
          </p>
        </template>

        <template v-else-if="state === 'done'">
          <h1
            class="text-xl font-semibold text-gray-900 dark:text-gray-100"
            data-testid="callback-done"
          >
            {{ bank }} est connectée
          </h1>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            Aucun compte n'est lu pour l'instant : dites lesquels sur la page
            des comptes.
          </p>
          <RouterLink
            to="/settings/accounts"
            class="mt-6 inline-block font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            Continuer
          </RouterLink>
        </template>

        <template v-else-if="state === 'failed'">
          <h1
            class="text-xl font-semibold text-gray-900 dark:text-gray-100"
            data-testid="callback-failed"
          >
            L'autorisation n'a pas abouti
          </h1>
          <!-- The server's words: a code already used, a session that expired,
               a redirect URL the bank does not recognise. Each needs something
               different, and none of them is guessable from here. -->
          <p
            class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
          >
            {{ message }}
          </p>
          <RouterLink
            to="/settings/accounts"
            class="mt-6 inline-block font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            Revenir aux comptes
          </RouterLink>
        </template>

        <template v-else>
          <h1
            class="text-xl font-semibold text-gray-900 dark:text-gray-100"
            data-testid="callback-nothing"
          >
            Aucun code reçu
          </h1>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            L'autorisation a été annulée, ou cette page a été ouverte
            directement.
          </p>
          <p
            v-if="message"
            class="mt-3 rounded-lg bg-red-50 p-3 font-mono text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
          >
            {{ message }}
          </p>
          <RouterLink
            to="/settings/accounts"
            class="mt-6 inline-block font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            Revenir aux comptes
          </RouterLink>
        </template>
      </div>
    </div>
  </div>
</template>
