<script setup lang="ts">
  /**
   * One bank account, as it appears under the connection that reads it.
   *
   * Identified (mapped to an account here), it is the full account card with
   * the bank's own controls folded in. Not yet identified, there is no
   * account to build a card around — just the lighter question of which one
   * it is.
   *
   * Extracted so the same rendering serves both the accounts shown directly
   * and the card accounts folded under "Comptes masqués": a card account is
   * always ignored — reading it counts every purchase twice, already reported
   * by the account it settles onto — so showing it inline the same way as a
   * real account overstates what needs attention.
   */
  import type { AccountDto, DiscoveredAccountDto } from '@/lib/api'
  import AccountCard from '@/components/settings/AccountCard.vue'

  defineProps<{
    discovered: DiscoveredAccountDto
    /** The account this bank account is, once someone has said so. */
    account: AccountDto | null
    bankName: string
    expanded: boolean
    saving: boolean
    accountOptions: AccountDto[]
    /** Passed straight through to the account card — see there for why. */
    needsReviewCount?: number | undefined
  }>()

  const emit = defineEmits<{
    toggle: []
    'ask-delete': []
    assign: [accountId: string]
    'toggle-ingestion': []
  }>()

  /** Read from a card account and every purchase is counted twice. */
  function isCard(discovered: DiscoveredAccountDto): boolean {
    return discovered.cashAccountType === 'CARD'
  }
</script>

<template>
  <!-- Identified: the full account card, with the bank's own controls
       folded in. -->
  <AccountCard
    v-if="account"
    :account="account"
    :expanded="expanded"
    :needs-review-count="needsReviewCount"
    @toggle="emit('toggle')"
    @ask-delete="emit('ask-delete')"
  >
    <template #extra-badges>
      <span
        class="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
      >
        {{ bankName }}
      </span>
    </template>
    <template #bank-summary>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ discovered.accountName }}
          <span
            v-if="discovered.cashAccountType"
            class="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-normal text-gray-700 dark:bg-slate-700 dark:text-gray-300"
          >
            {{ discovered.cashAccountType }}
          </span>
          <span v-if="discovered.iban"> · {{ discovered.iban }}</span>
        </p>
        <button
          type="button"
          data-testid="ingest-toggle"
          :disabled="saving || isCard(discovered)"
          class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          :class="
            discovered.isIngested
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
              : 'bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-gray-300'
          "
          @click="emit('toggle-ingestion')"
        >
          {{ discovered.isIngested ? 'Lu' : 'Ignoré' }}
        </button>
      </div>
      <p
        v-if="discovered.warning"
        class="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
        data-testid="account-warning"
      >
        {{ discovered.warning }}
      </p>
    </template>
    <template #bank-link>
      <div>
        <label
          class="text-sm text-gray-600 dark:text-gray-400"
          :for="`link-${discovered.linkId}`"
        >
          Correspond à
        </label>
        <select
          :id="`link-${discovered.linkId}`"
          data-testid="account-select"
          :value="discovered.accountId ?? ''"
          :disabled="saving"
          class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
          @change="emit('assign', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">— aucun —</option>
          <option
            v-for="option in accountOptions"
            :key="option.id"
            :value="option.id"
          >
            {{ option.name }}
          </option>
        </select>
      </div>
    </template>
  </AccountCard>

  <!-- Not yet identified: no account to build a card around, just the
       lighter question of which one it is. -->
  <li
    v-else
    data-testid="bank-account"
    class="rounded-lg bg-gray-50 p-4 dark:bg-slate-800"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate font-medium text-gray-900 dark:text-gray-100">
          {{ discovered.accountName }}
          <span
            v-if="discovered.cashAccountType"
            class="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-normal text-gray-700 dark:bg-slate-700 dark:text-gray-300"
          >
            {{ discovered.cashAccountType }}
          </span>
        </p>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ discovered.product ?? '—' }}
          <!-- The IBAN is what tells two identically named accounts apart;
             Boursorama returns two cards with one name. -->
          <span v-if="discovered.iban"> · {{ discovered.iban }}</span>
        </p>
      </div>

      <button
        type="button"
        data-testid="ingest-toggle"
        :disabled="saving || isCard(discovered)"
        class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        :class="
          discovered.isIngested
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
            : 'bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-gray-300'
        "
        @click="emit('toggle-ingestion')"
      >
        {{ discovered.isIngested ? 'Lu' : 'Ignoré' }}
      </button>
    </div>

    <div class="mt-3">
      <label
        class="text-sm text-gray-600 dark:text-gray-400"
        :for="`link-${discovered.linkId}`"
      >
        Correspond à
      </label>
      <select
        :id="`link-${discovered.linkId}`"
        data-testid="account-select"
        :value="discovered.accountId ?? ''"
        :disabled="saving"
        class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
        @change="emit('assign', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">— aucun —</option>
        <option
          v-for="option in accountOptions"
          :key="option.id"
          :value="option.id"
        >
          {{ option.name }}
        </option>
      </select>

      <!-- Stated against the evidence a person can judge, never as "these
         look alike". -->
      <p
        v-if="discovered.suggestion"
        class="mt-2 text-sm text-gray-600 dark:text-gray-400"
        data-testid="account-suggestion"
      >
        {{ discovered.suggestion.matches }} transactions correspondent à
        <strong>{{ discovered.suggestion.accountLabel }}</strong>
        <button
          type="button"
          class="ml-2 font-medium text-emerald-600 hover:underline dark:text-emerald-400"
          @click="emit('assign', discovered.suggestion.accountId)"
        >
          associer
        </button>
      </p>
    </div>

    <p
      v-if="discovered.warning"
      class="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
      data-testid="account-warning"
    >
      {{ discovered.warning }}
    </p>
  </li>
</template>
