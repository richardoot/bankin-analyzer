<script setup lang="ts">
  /**
   * What the product does, for a visitor deciding whether to sign up. Bank
   * synchronisation gets its own spotlight before the grid: it is the
   * feature that makes the rest happen without effort, and the grid alone
   * would bury it among seven equals.
   *
   * Every claim here is one the app keeps: nightly sync via a Vercel cron,
   * on-demand sync from the Comptes page, categorisation from the user's
   * own history before any model, CSV and sync recognising each other's
   * rows, a balance point per sync, an installable PWA and an MCP server.
   */
  interface Step {
    number: string
    title: string
    description: string
  }

  interface Feature {
    title: string
    description: string
    /** Heroicons outline path, drawn in a 24×24 viewBox. */
    iconPath: string
    color: keyof typeof colorClasses
  }

  const steps: Step[] = [
    {
      number: '1',
      title: 'Connectez votre banque',
      description:
        'Vous vous identifiez chez votre banque, via le standard européen DSP2. Sans banque compatible, un export CSV Bankin fait l’affaire.',
    },
    {
      number: '2',
      title: 'Laissez tourner',
      description:
        'Chaque nuit, les nouvelles transactions sont récupérées, classées d’après vos habitudes, et les soldes relevés. Un bouton relance tout à la demande.',
    },
    {
      number: '3',
      title: 'Analysez',
      description:
        'Dépenses par catégorie et par mois, budget prévisionnel, remboursements partagés, étiquettes par projet : tout se lit sur des données toujours à jour.',
    },
  ]

  const syncPoints = [
    {
      title: 'Identifiants jamais partagés',
      description:
        'La connexion passe par Enable Banking, un agrégateur agréé DSP2. Vous vous authentifiez chez votre banque ; aucun mot de passe bancaire ne transite ici.',
    },
    {
      title: 'Chaque nuit, et quand vous voulez',
      description:
        'Une synchronisation planifiée récupère les nouvelles transactions et relève le solde de chaque compte. Un clic depuis la page Comptes fait la même chose à l’instant.',
    },
    {
      title: 'Classées d’après vos habitudes',
      description:
        'Un abonnement, un péage, votre supermarché : ce que vous avez déjà classé l’est à nouveau, sans rien demander. L’inconnu reste à classer plutôt que d’être mal classé.',
    },
    {
      title: 'CSV et synchro sans doublon',
      description:
        'Les transactions déjà importées depuis Bankin sont reconnues par la synchronisation, et inversement. Les deux sources coexistent sur les mêmes comptes.',
    },
  ]

  // Tailwind only ships classes it can read in full, hence the literal
  // strings rather than a template built from the color name.
  const colorClasses = {
    primary: {
      box: 'bg-primary-100 dark:bg-primary-900/30',
      icon: 'text-primary-600 dark:text-primary-400',
    },
    blue: {
      box: 'bg-blue-100 dark:bg-blue-900/30',
      icon: 'text-blue-600 dark:text-blue-400',
    },
    purple: {
      box: 'bg-purple-100 dark:bg-purple-900/30',
      icon: 'text-purple-600 dark:text-purple-400',
    },
    amber: {
      box: 'bg-amber-100 dark:bg-amber-900/30',
      icon: 'text-amber-600 dark:text-amber-400',
    },
    rose: {
      box: 'bg-rose-100 dark:bg-rose-900/30',
      icon: 'text-rose-600 dark:text-rose-400',
    },
    slate: {
      box: 'bg-slate-100 dark:bg-slate-700/40',
      icon: 'text-slate-600 dark:text-slate-300',
    },
  } as const

  const features: Feature[] = [
    {
      title: 'Synchronisation bancaire',
      description:
        'Connectez une ou plusieurs banques. Transactions et soldes arrivent chaque nuit, avec le logo et l’état de chaque connexion sur la page Comptes.',
      iconPath:
        'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
      color: 'primary',
    },
    {
      title: 'Catégorisation automatique',
      description:
        'Votre historique classe d’abord ; une IA ne prend le relais que sur ce qu’il ne reconnaît pas, et propose plutôt que d’imposer.',
      iconPath:
        'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
      color: 'blue',
    },
    {
      title: 'Dashboard',
      description:
        'Dépenses et revenus par mois et par catégorie, sur la période de votre choix, avec les catégories que vous voulez voir et celles à masquer.',
      iconPath:
        'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
      color: 'slate',
    },
    {
      title: 'Budget prévisionnel',
      description:
        'Un assistant en trois étapes fixe un budget par catégorie ; le réel s’y compare mois par mois, épargne et projets compris.',
      iconPath:
        'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
      color: 'primary',
    },
    {
      title: 'Remboursements partagés',
      description:
        'Associez une dépense à une personne, suivez qui doit quoi, et soldez en un récapitulatif.',
      iconPath:
        'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
      color: 'purple',
    },
    {
      title: 'Étiquettes d’analyse',
      description:
        'Regroupez des transactions par projet ou par événement — vacances, travaux — et isolez leur coût réel.',
      iconPath:
        'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
      color: 'amber',
    },
    {
      title: 'Import CSV Bankin',
      description:
        'Toujours là pour les comptes hors synchronisation ou l’historique ancien : un import en quatre écrans, doublons détectés.',
      iconPath:
        'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
      color: 'slate',
    },
    {
      title: 'Sur votre téléphone',
      description:
        'Installable comme une application, avec une interface pensée pour le pouce : filtres repliés, actions à portée.',
      iconPath:
        'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
      color: 'rose',
    },
    {
      title: 'Vos données, vos questions',
      description:
        'Un serveur MCP expose vos transactions et budgets à un assistant comme Claude, après votre accord explicite.',
      iconPath:
        'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
      color: 'blue',
    },
  ]
</script>

<template>
  <section
    id="fonctionnalites"
    class="bg-white dark:bg-slate-900 py-20 transition-colors scroll-mt-16"
  >
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <!-- How it works -->
      <div class="text-center">
        <h2
          class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl"
        >
          Comment ça marche ?
        </h2>
        <p
          class="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400"
        >
          Une connexion, puis plus rien à saisir
        </p>
      </div>

      <!-- Steps -->
      <ol class="mt-16 grid gap-8 sm:grid-cols-3" data-testid="steps">
        <li
          v-for="step in steps"
          :key="step.number"
          class="relative text-center"
        >
          <!-- Step number -->
          <div
            class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30 text-2xl font-bold text-primary-600 dark:text-primary-400"
            aria-hidden="true"
          >
            {{ step.number }}
          </div>

          <!-- Arrow (hidden on mobile, shown between steps on desktop) -->
          <div
            v-if="step.number !== '3'"
            class="absolute right-0 top-8 hidden -translate-y-1/2 translate-x-1/2 sm:block"
            aria-hidden="true"
          >
            <svg
              class="h-6 w-6 text-gray-300 dark:text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>

          <h3
            class="mt-4 text-xl font-semibold text-gray-900 dark:text-gray-100"
          >
            {{ step.title }}
          </h3>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            {{ step.description }}
          </p>
        </li>
      </ol>

      <!-- Bank sync spotlight -->
      <div
        id="synchronisation"
        data-testid="sync-spotlight"
        class="mt-24 rounded-3xl bg-gradient-to-br from-primary-50 to-white dark:from-primary-950/40 dark:to-slate-900 border border-primary-100 dark:border-primary-900/40 p-8 sm:p-12 scroll-mt-16"
      >
        <div class="grid gap-10 lg:grid-cols-5 lg:gap-16">
          <div class="lg:col-span-2">
            <p
              class="text-sm font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400"
            >
              Synchronisation bancaire
            </p>
            <h2
              class="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl"
            >
              Plus d’export à faire, plus de ligne à saisir
            </h2>
            <p class="mt-4 text-lg text-gray-600 dark:text-gray-400">
              Le suivi de ses dépenses s’arrête le jour où il demande un effort.
              La synchronisation retire cet effort : les données arrivent,
              l’analyse est déjà là.
            </p>
          </div>

          <ul class="grid gap-6 sm:grid-cols-2 lg:col-span-3">
            <li
              v-for="point in syncPoints"
              :key="point.title"
              class="flex gap-3"
            >
              <span
                class="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500 dark:bg-primary-600 text-white"
                aria-hidden="true"
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
                    stroke-width="2.5"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </span>
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-gray-100">
                  {{ point.title }}
                </h3>
                <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {{ point.description }}
                </p>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Features -->
      <div class="mt-24">
        <div class="text-center">
          <h2
            class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl"
          >
            Tout ce qui suit, sur des données à jour
          </h2>
        </div>

        <ul
          class="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="features"
        >
          <li
            v-for="feature in features"
            :key="feature.title"
            class="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 shadow-sm dark:shadow-slate-900/20 transition-shadow hover:shadow-md dark:hover:shadow-slate-900/30"
          >
            <div
              class="flex h-12 w-12 items-center justify-center rounded-xl"
              :class="colorClasses[feature.color].box"
              aria-hidden="true"
            >
              <svg
                class="h-6 w-6"
                :class="colorClasses[feature.color].icon"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  :d="feature.iconPath"
                />
              </svg>
            </div>

            <h3
              class="mt-4 text-xl font-semibold text-gray-900 dark:text-gray-100"
            >
              {{ feature.title }}
            </h3>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
              {{ feature.description }}
            </p>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
