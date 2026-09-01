<script setup lang="ts">
  /**
   * Where the bank sends the browser back after authorization.
   *
   * For now it only surfaces the authorization code so it can be handed to the
   * phase 2 spike script. It deliberately does not call the backend: no
   * endpoint exchanges the code yet, and inventing one here would commit to a
   * shape before the spike has said what the data looks like.
   *
   * The page is public on purpose. The redirect arrives from the bank, in
   * whatever browser state the user left behind, and bouncing it to the login
   * screen would drop the code from the URL — the one thing worth keeping.
   */
  import { computed, ref } from 'vue'
  import { useRoute } from 'vue-router'

  const route = useRoute()

  const code = computed(() => (route.query.code as string | undefined) ?? null)
  const errorMessage = computed(
    () => (route.query.error as string | undefined) ?? null
  )

  const command = computed(
    () =>
      `pnpm ts-node src/scripts/spike-enable-banking-fetch.ts --code ${code.value}`
  )

  const copied = ref<'code' | 'command' | null>(null)

  async function copy(what: 'code' | 'command'): Promise<void> {
    const text = what === 'code' ? code.value : command.value
    if (!text) return
    await navigator.clipboard.writeText(text)
    copied.value = what
    setTimeout(() => {
      copied.value = null
    }, 2000)
  }
</script>

<template>
  <div
    class="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gray-50 dark:bg-slate-800 px-4 transition-colors"
  >
    <div class="w-full max-w-2xl">
      <div
        class="rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-lg dark:shadow-slate-900/20"
      >
        <!-- Success: a code came back -->
        <template v-if="code">
          <div
            class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30"
          >
            <svg
              class="h-8 w-8 text-emerald-600 dark:text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <h1
            class="mt-6 text-center text-2xl font-bold text-gray-900 dark:text-gray-100"
          >
            Banque autorisee
          </h1>
          <p class="mt-2 text-center text-gray-600 dark:text-gray-400">
            Voici le code d'autorisation. Il est a usage unique et de courte
            duree : utilisez-le tout de suite.
          </p>

          <div class="mt-6">
            <label
              class="text-sm font-medium text-gray-700 dark:text-gray-300"
              for="auth-code"
            >
              Code
            </label>
            <div class="mt-1 flex gap-2">
              <input
                id="auth-code"
                :value="code"
                readonly
                data-testid="bank-callback-code"
                class="flex-1 rounded-lg border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                aria-label="Copier le code"
                class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                @click="copy('code')"
              >
                {{ copied === 'code' ? 'Copie !' : 'Copier' }}
              </button>
            </div>
          </div>

          <div class="mt-6">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Commande a lancer depuis <code>backend/</code>
            </p>
            <div class="mt-1 flex gap-2">
              <pre
                class="flex-1 overflow-x-auto rounded-lg bg-gray-900 dark:bg-slate-950 px-3 py-2 font-mono text-xs text-gray-100"
                >{{ command }}</pre
              >
              <button
                type="button"
                aria-label="Copier la commande"
                class="shrink-0 rounded-lg bg-gray-700 dark:bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:hover:bg-slate-600"
                @click="copy('command')"
              >
                {{ copied === 'command' ? 'Copie !' : 'Copier' }}
              </button>
            </div>
          </div>
        </template>

        <!-- The bank refused, or the user cancelled -->
        <template v-else>
          <div
            class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
          >
            <svg
              class="h-8 w-8 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>

          <h1
            class="mt-6 text-center text-2xl font-bold text-gray-900 dark:text-gray-100"
          >
            Aucun code recu
          </h1>
          <p class="mt-2 text-center text-gray-600 dark:text-gray-400">
            L'autorisation a ete annulee, a echoue, ou cette page a ete ouverte
            directement.
          </p>
          <p
            v-if="errorMessage"
            class="mt-4 rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-center font-mono text-sm text-red-700 dark:text-red-300"
          >
            {{ errorMessage }}
          </p>
          <p class="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Relancez l'autorisation depuis le script pour obtenir une nouvelle
            URL.
          </p>
        </template>
      </div>
    </div>
  </div>
</template>
