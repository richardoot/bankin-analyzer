<script setup lang="ts">
  /**
   * Publique et sans authentification, à dessein : Enable Banking exige une
   * « Privacy URL » pour toute application en environnement Production, et
   * la page doit être lisible par leurs équipes comme par l'utilisateur qui
   * la déclare — le tutoriel de la carte Enable Banking pointe ici.
   */
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-10">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">
      Politique de confidentialité
    </h1>
    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
      Finance Analyzer — outil d'analyse de finances personnelles.
    </p>

    <section class="mt-8 space-y-3">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Quelles données sont traitées
      </h2>
      <p class="text-gray-600 dark:text-gray-400">
        Finance Analyzer traite les données que vous lui confiez : vos comptes,
        vos transactions et leurs catégories, importées depuis un fichier ou
        synchronisées depuis votre banque via Enable Banking, avec le
        consentement que vous donnez explicitement à votre banque. L'accès aux
        données bancaires est en lecture seule.
      </p>
    </section>

    <section class="mt-8 space-y-3">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Pourquoi elles sont traitées
      </h2>
      <p class="text-gray-600 dark:text-gray-400">
        Dans un seul but : vous présenter l'analyse de vos propres finances. Vos
        données ne sont ni vendues, ni partagées avec des tiers, ni utilisées à
        des fins publicitaires.
      </p>
    </section>

    <section class="mt-8 space-y-3">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Où et comment elles sont conservées
      </h2>
      <p class="text-gray-600 dark:text-gray-400">
        Les données sont hébergées dans une base PostgreSQL au sein de l'Union
        européenne. Les identifiants de votre application Enable Banking (App ID
        et clé privée) sont stockés chiffrés (AES-256-GCM) et la clé privée
        n'est jamais réaffichée. La session d'authentification est le seul usage
        fait des cookies.
      </p>
    </section>

    <section class="mt-8 space-y-3">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Vos droits
      </h2>
      <p class="text-gray-600 dark:text-gray-400">
        Vous pouvez consulter, exporter et supprimer vos données à tout moment
        depuis l'application. La suppression de votre compte efface vos données
        et votre identité de connexion. Le consentement bancaire donné via
        Enable Banking est révocable auprès de votre banque, indépendamment de
        cette application.
      </p>
    </section>
  </div>
</template>
