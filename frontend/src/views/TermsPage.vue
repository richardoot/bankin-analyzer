<script setup lang="ts">
  /**
   * Publique et sans authentification, à dessein : Enable Banking exige une
   * « Terms URL » pour toute application en environnement Production — le
   * tutoriel de la carte Enable Banking pointe ici.
   */
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-10">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">
      Conditions d'utilisation
    </h1>
    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
      Finance Analyzer — outil d'analyse de finances personnelles.
    </p>

    <section class="mt-8 space-y-3">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Le service
      </h2>
      <p class="text-gray-600 dark:text-gray-400">
        Finance Analyzer permet d'importer, de catégoriser et d'analyser ses
        finances personnelles. La synchronisation bancaire se fait au nom de
        votre propre application Enable Banking, que vous créez et déclarez
        vous-même ; l'accès aux comptes repose sur le consentement que vous
        donnez à votre banque (DSP2), en lecture seule, et reste révocable à
        tout moment auprès d'elle.
      </p>
    </section>

    <section class="mt-8 space-y-3">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Ce que le service n'est pas
      </h2>
      <p class="text-gray-600 dark:text-gray-400">
        Finance Analyzer ne fournit aucun conseil financier et n'initie aucun
        paiement ni aucun ordre sur vos comptes. Les analyses présentées sont
        informatives et calculées à partir des données que vous fournissez.
      </p>
    </section>

    <section class="mt-8 space-y-3">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Vos responsabilités
      </h2>
      <p class="text-gray-600 dark:text-gray-400">
        Vous restez responsable de vos identifiants de connexion et de votre
        application Enable Banking (App ID et clé privée). La clé privée n'est
        téléchargeable qu'une fois depuis le Control Panel d'Enable Banking :
        conservez-en une copie en lieu sûr.
      </p>
    </section>

    <section class="mt-8 space-y-3">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Disponibilité et résiliation
      </h2>
      <p class="text-gray-600 dark:text-gray-400">
        Le service est fourni tel quel, sans garantie de disponibilité. Vous
        pouvez supprimer votre compte à tout moment ; cette suppression efface
        vos données conformément à la
        <RouterLink
          to="/privacy"
          class="text-primary-700 underline hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
          >politique de confidentialité</RouterLink
        >.
      </p>
    </section>
  </div>
</template>
