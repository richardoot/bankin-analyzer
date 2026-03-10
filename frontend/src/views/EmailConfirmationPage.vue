<script setup lang="ts">
  import { useRoute } from 'vue-router'

  const route = useRoute()
  const email = route.query.email as string | undefined
</script>

<template>
  <div
    class="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gray-50 dark:bg-slate-800 px-4 transition-colors"
  >
    <div class="w-full max-w-md text-center">
      <div
        class="rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-lg dark:shadow-slate-900/20"
      >
        <!-- Icon -->
        <div
          class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30"
        >
          <svg
            class="h-10 w-10 text-emerald-600 dark:text-emerald-400"
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

        <!-- Title -->
        <h1 class="mt-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
          Verifiez votre boite mail
        </h1>

        <!-- Description -->
        <p class="mt-4 text-gray-600 dark:text-gray-400">
          Nous avons envoye un lien de confirmation a
          <span
            v-if="email"
            class="font-medium text-gray-900 dark:text-gray-100"
            >{{ email }}</span
          >
          <span v-else>votre adresse email</span>.
        </p>

        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Cliquez sur le lien dans l'email pour activer votre compte.
        </p>

        <!-- Info box -->
        <div
          class="mt-6 rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 text-left"
        >
          <div class="flex">
            <div class="flex-shrink-0">
              <svg
                class="h-5 w-5 text-blue-600 dark:text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm text-blue-700 dark:text-blue-300">
                Si vous ne trouvez pas l'email, verifiez votre dossier spam.
              </p>
            </div>
          </div>
        </div>

        <!-- Back to login -->
        <div class="mt-8">
          <RouterLink
            to="/login"
            class="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400"
          >
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Retour a la connexion
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
