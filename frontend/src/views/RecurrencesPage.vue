<script setup lang="ts">
  /**
   * What the user pays without deciding to each time: subscriptions, rent,
   * insurance — every charge the ledger shows coming back on its own. It is
   * the list a "Subscriptions" category would have given, without filing
   * Netflix by how it is paid rather than by what it is for.
   *
   * Detection proposes, the user corrects: the ✕ on a row ("Écarter : ce
   * n'est pas un abonnement") dismisses a series for good, "Confirmer" promotes one seen only twice.
   * A row opens the transactions it was read from.
   *
   * Two tabs: what runs today, and what ran before — each ended charge with
   * when it started, when it stopped, how long it lasted and what it cost.
   */
  import { computed, onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import PageShell from '@/components/ui/PageShell.vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import EmptyState from '@/components/ui/EmptyState.vue'
  import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
  import RecurrenceNameEditor from '@/components/recurrences/RecurrenceNameEditor.vue'
  import DivisorBadge from '@/components/recurrences/DivisorBadge.vue'
  import {
    api,
    recurrenceFilterKey,
    type SubscriptionSummaryDto,
    type RecurrenceDto,
    type RecurrenceListDto,
    type RecurrencePeriod,
  } from '@/lib/api'
  import { formatCurrency, formatDate, formatMonth } from '@/lib/formatters'
  import { useToast } from '@/composables/useToast'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import IconPencil from '@/components/icons/IconPencil.vue'
  import IconClose from '@/components/icons/IconClose.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'

  const router = useRouter()
  const toast = useToast()

  const list = ref<RecurrenceListDto | null>(null)
  const loading = ref(true)
  const failed = ref(false)
  /** The series a decision is being written for, to disable its buttons. */
  const busyKey = ref<string | null>(null)

  type SortKey = 'category' | 'amount' | 'age'
  const sortBy = ref<SortKey>('category')

  type Tab = 'current' | 'ended'
  const tab = ref<Tab>('current')

  const PERIOD_LABELS: Record<RecurrencePeriod, string> = {
    WEEKLY: 'par semaine',
    FOUR_WEEKLY: 'toutes les 4 semaines',
    MONTHLY: 'par mois',
    QUARTERLY: 'par trimestre',
    YEARLY: 'par an',
  }

  const formatMediumDate = (iso: string): string => formatDate(iso, 'medium')
  const formatMonthInline = (iso: string): string =>
    formatMonth(iso, { capitalize: false })

  /** What one charge covers, in months: the last one paid for its period too. */
  const PERIOD_MONTHS: Record<RecurrencePeriod, number> = {
    WEEKLY: 12 / 52,
    FOUR_WEEKLY: 12 / 13,
    MONTHLY: 1,
    QUARTERLY: 3,
    YEARLY: 12,
  }

  /** How long a series ran, from its first charge to the end of its last. */
  function formatDuration(row: RecurrenceDto): string {
    const days =
      (Date.parse(row.lastDate) - Date.parse(row.firstDate)) / 86_400_000
    const months = Math.max(
      1,
      Math.round(days / (365.25 / 12) + PERIOD_MONTHS[row.period])
    )
    if (months < 12) return `${months} mois`
    const years = Math.floor(months / 12)
    const rest = months % 12
    const yearLabel = `${years} an${years > 1 ? 's' : ''}`
    return rest > 0 ? `${yearLabel} ${rest} mois` : yearLabel
  }

  async function load(): Promise<void> {
    loading.value = true
    failed.value = false
    try {
      list.value = await api.getRecurrences()
    } catch {
      failed.value = true
    } finally {
      loading.value = false
    }
  }

  const byStatus = (status: RecurrenceDto['status']): RecurrenceDto[] =>
    list.value?.recurrences.filter(r => r.status === status) ?? []

  const active = computed(() => byStatus('ACTIVE'))
  const candidates = computed(() => byStatus('CANDIDATE'))
  /** Latest ended first. */
  const stopped = computed(() =>
    byStatus('STOPPED').sort((a, b) => b.lastDate.localeCompare(a.lastDate))
  )
  const tabs = computed<Array<{ key: Tab; label: string; count: number }>>(
    () => [
      {
        key: 'current',
        label: 'En cours',
        count: active.value.length + candidates.value.length,
      },
      { key: 'ended', label: 'Terminés', count: stopped.value.length },
    ]
  )
  const stoppedTotal = computed(() =>
    stopped.value.reduce((sum, r) => sum + r.totalPaid, 0)
  )
  const dismissed = computed(() => list.value?.dismissed ?? [])
  const orphans = computed(() => list.value?.orphans ?? [])

  function sorted(rows: RecurrenceDto[]): RecurrenceDto[] {
    const copy = [...rows]
    if (sortBy.value === 'age') {
      return copy.sort((a, b) => a.firstDate.localeCompare(b.firstDate))
    }
    return copy.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent)
  }

  interface Group {
    key: string
    title: string | null
    icon: string | null
    monthlyTotal: number
    rows: RecurrenceDto[]
  }

  /** By category, heaviest first; one untitled group for the other sorts. */
  const activeGroups = computed<Group[]>(() => {
    if (sortBy.value !== 'category') {
      return [
        {
          key: 'all',
          title: null,
          icon: null,
          monthlyTotal: list.value?.monthlyTotal ?? 0,
          rows: sorted(active.value),
        },
      ]
    }
    const groups = new Map<string, Group>()
    for (const row of active.value) {
      const key = row.categoryId ?? 'none'
      const group = groups.get(key) ?? {
        key,
        title: row.categoryName ?? 'Sans catégorie',
        icon: row.categoryIcon,
        monthlyTotal: 0,
        rows: [],
      }
      group.monthlyTotal += row.monthlyEquivalent
      group.rows.push(row)
      groups.set(key, group)
    }
    return [...groups.values()]
      .map(g => ({ ...g, rows: sorted(g.rows) }))
      .sort((a, b) => b.monthlyTotal - a.monthlyTotal)
  })

  const rowKey = (r: { merchantKey: string; amountBucket: number | null }) =>
    `${r.amountBucket ?? '*'}:${r.merchantKey}`

  function openTransactions(row: RecurrenceDto): void {
    void router.push({
      path: '/transactions',
      query: {
        recurrence: recurrenceFilterKey(row),
        recurrenceLabel: row.name,
      },
    })
  }

  async function decide(
    row: RecurrenceDto,
    decision: 'CONFIRMED' | 'DISMISSED'
  ): Promise<void> {
    if (busyKey.value) return
    busyKey.value = rowKey(row)
    try {
      list.value = await api.setRecurrenceDecision({
        merchantKey: row.merchantKey,
        amountBucket: row.amountBucket,
        decision,
      })
      toast.success(
        decision === 'DISMISSED'
          ? `« ${row.name} » retiré des récurrences`
          : `« ${row.name} » confirmé`
      )
    } catch {
      toast.error("La décision n'a pas pu être enregistrée")
    } finally {
      busyKey.value = null
    }
  }

  /** The series whose name is being edited, by `rowKey`. */
  const editingKey = ref<string | null>(null)

  async function rename(
    row: RecurrenceDto,
    name: string | null
  ): Promise<void> {
    if (busyKey.value) return
    busyKey.value = rowKey(row)
    try {
      list.value = await api.renameRecurrence({
        merchantKey: row.merchantKey,
        amountBucket: row.amountBucket,
        name,
      })
      editingKey.value = null
    } catch {
      toast.error("Le nom n'a pas pu être enregistré")
    } finally {
      busyKey.value = null
    }
  }

  /**
   * Forget a subscription: a dismissed one comes back as detection reads
   * it; a followed one no series answers any more simply goes.
   */
  async function forget(
    subscription: SubscriptionSummaryDto,
    done: string
  ): Promise<void> {
    if (busyKey.value) return
    busyKey.value = subscription.id
    try {
      list.value = await api.deleteSubscription(subscription.id)
      toast.success(done)
    } catch {
      toast.error("L'abonnement n'a pas pu être oublié")
    } finally {
      busyKey.value = null
    }
  }

  onMounted(load)
</script>

<template>
  <PageShell>
    <PageHeader
      title="Récurrences"
      subtitle="Abonnements et charges qui reviennent seules, lus dans vos dépenses."
    />

    <div v-if="loading" class="space-y-4" data-testid="recurrences-loading">
      <SkeletonBlock class="h-24 rounded-xl" />
      <SkeletonBlock :lines="6" />
    </div>

    <InlineAlert
      v-else-if="failed"
      data-testid="recurrences-error"
      retry-label="Réessayer"
      @retry="load"
    >
      Les récurrences n'ont pas pu être chargées.
    </InlineAlert>

    <template v-else-if="list">
      <BaseCard class="mb-6" data-testid="recurrences-total">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ active.length }}
          {{ active.length > 1 ? 'charges actives' : 'charge active' }}
        </p>
        <p
          class="mt-1 text-3xl font-semibold tabular-nums text-gray-900 dark:text-gray-100"
        >
          {{ formatCurrency(list.monthlyTotal) }}
          <span class="text-base font-normal text-gray-500 dark:text-gray-400"
            >/ mois</span
          >
        </p>
        <p
          v-if="list.monthlyTotal > 0"
          class="mt-2 text-xs text-gray-500 dark:text-gray-400"
        >
          Essentiel {{ formatCurrency(list.byNature.essential) }} · Plaisir
          {{ formatCurrency(list.byNature.pleasure) }}
          <template v-if="list.byNature.unclassified > 0">
            · Non classé {{ formatCurrency(list.byNature.unclassified) }}
          </template>
        </p>
      </BaseCard>

      <EmptyState
        v-if="
          list.recurrences.length === 0 &&
          dismissed.length === 0 &&
          orphans.length === 0
        "
        title="Aucune charge récurrente détectée"
        description="Une charge apparaît ici dès qu'elle revient trois fois au même montant et au même rythme."
      />

      <template v-else>
        <SegmentedControl
          v-model="tab"
          class="mb-4"
          label="Abonnements"
          :options="
            tabs.map(t => ({
              value: t.key,
              label: `${t.label} (${t.count})`,
              testId: `tab-${t.key}`,
            }))
          "
        />

        <template v-if="tab === 'current'">
          <div
            v-if="active.length > 0"
            class="mb-3 flex items-center justify-end gap-2"
          >
            <label
              for="recurrences-sort"
              class="text-xs text-gray-500 dark:text-gray-400"
              >Trier</label
            >
            <select
              id="recurrences-sort"
              v-model="sortBy"
              data-testid="recurrences-sort"
              class="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-gray-100"
            >
              <option value="category">par catégorie</option>
              <option value="amount">par montant</option>
              <option value="age">par ancienneté</option>
            </select>
          </div>

          <BaseCard
            v-for="group in activeGroups"
            :key="group.key"
            as="section"
            padding="none"
            class="mb-4 overflow-hidden"
            data-testid="recurrence-group"
          >
            <header
              v-if="group.title"
              class="flex items-center justify-between border-b border-gray-100 px-4 py-2 dark:border-slate-800"
            >
              <h2
                class="text-sm font-semibold text-gray-800 dark:text-gray-200"
              >
                <span v-if="group.icon" class="mr-1">{{ group.icon }}</span>
                {{ group.title }}
              </h2>
              <span
                class="text-sm tabular-nums text-gray-600 dark:text-gray-400"
              >
                {{ formatCurrency(group.monthlyTotal) }} / mois
              </span>
            </header>
            <ul class="divide-y divide-gray-100 dark:divide-slate-800">
              <li
                v-for="row in group.rows"
                :key="row.id"
                class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid="recurrence-row"
              >
                <RecurrenceNameEditor
                  v-if="editingKey === rowKey(row)"
                  :name="row.name"
                  :named="row.named"
                  :saving="busyKey !== null"
                  @save="name => rename(row, name)"
                  @cancel="editingKey = null"
                />
                <button
                  v-else
                  type="button"
                  class="min-w-0 flex-1 text-left"
                  :aria-label="`Voir les transactions de ${row.name}`"
                  @click="openTransactions(row)"
                >
                  <span class="flex min-w-0 items-center gap-1.5">
                    <span
                      class="truncate font-medium text-gray-900 hover:underline dark:text-gray-100"
                      data-testid="recurrence-name"
                      >{{ row.name }}</span
                    >
                    <DivisorBadge :divisor="row.divisor" />
                  </span>
                  <span
                    v-if="row.name !== row.label"
                    class="block truncate text-[11px] text-gray-400 dark:text-gray-500"
                    >{{ row.label }}</span
                  >
                  <span
                    class="block truncate text-xs text-gray-500 dark:text-gray-400"
                  >
                    {{
                      row.subcategoryName ??
                      row.categoryName ??
                      'Sans catégorie'
                    }}
                    · depuis {{ formatMonthInline(row.firstDate) }} ·
                    {{ formatCurrency(row.totalPaid) }} payés
                  </span>
                </button>
                <div
                  class="flex items-center justify-between gap-4 sm:justify-end"
                >
                  <div class="text-right">
                    <span
                      class="block tabular-nums font-medium text-gray-900 dark:text-gray-100"
                      >{{ formatCurrency(row.amount) }}
                      <span
                        class="text-xs font-normal text-gray-500 dark:text-gray-400"
                        >{{ PERIOD_LABELS[row.period] }}</span
                      ></span
                    >
                    <span
                      v-if="row.period !== 'MONTHLY'"
                      class="block text-xs tabular-nums text-gray-500 dark:text-gray-400"
                      >soit {{ formatCurrency(row.monthlyEquivalent) }} /
                      mois</span
                    >
                  </div>
                  <BaseIconButton
                    :disabled="busyKey !== null"
                    :label="`Renommer ${row.name}`"
                    data-testid="rename-recurrence"
                    @click="editingKey = rowKey(row)"
                  >
                    <IconPencil />
                  </BaseIconButton>
                  <BaseIconButton
                    variant="danger"
                    :disabled="busyKey !== null"
                    :label="`Écarter ${row.name} : ce n'est pas un abonnement`"
                    data-testid="dismiss-recurrence"
                    @click="decide(row, 'DISMISSED')"
                  >
                    <IconClose />
                  </BaseIconButton>
                </div>
              </li>
            </ul>
          </BaseCard>

          <section
            v-if="candidates.length > 0"
            class="mb-4 rounded-xl border border-dashed border-gray-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
            data-testid="recurrence-candidates"
          >
            <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-200">
              À confirmer
            </h2>
            <p class="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Vues deux fois seulement : confirmez celles qui sont des
              abonnements, elles compteront tout de suite.
            </p>
            <ul class="divide-y divide-gray-100 dark:divide-slate-800">
              <li
                v-for="row in candidates"
                :key="row.id"
                class="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
                data-testid="candidate-row"
              >
                <button
                  type="button"
                  class="min-w-0 flex-1 text-left"
                  @click="openTransactions(row)"
                >
                  <span class="flex min-w-0 items-center gap-1.5">
                    <span
                      class="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
                      >{{ row.name }}</span
                    >
                    <DivisorBadge :divisor="row.divisor" />
                  </span>
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    {{ formatCurrency(row.amount) }}
                    {{ PERIOD_LABELS[row.period] }} · le
                    {{ formatMediumDate(row.lastDate) }}
                  </span>
                </button>
                <div class="flex gap-2">
                  <BaseButton
                    size="sm"
                    :disabled="busyKey !== null"
                    data-testid="confirm-recurrence"
                    @click="decide(row, 'CONFIRMED')"
                  >
                    Confirmer
                  </BaseButton>
                  <BaseIconButton
                    variant="danger"
                    :disabled="busyKey !== null"
                    :label="`Écarter ${row.name} : ce n'est pas un abonnement`"
                    data-testid="dismiss-recurrence"
                    @click="decide(row, 'DISMISSED')"
                  >
                    <IconClose />
                  </BaseIconButton>
                </div>
              </li>
            </ul>
          </section>
        </template>

        <template v-else>
          <BaseCard
            v-if="stopped.length === 0"
            class="text-center text-sm text-gray-500 dark:text-gray-400"
            data-testid="ended-empty"
          >
            Aucun abonnement terminé.
          </BaseCard>
          <BaseCard
            v-else
            as="section"
            padding="none"
            class="mb-4 overflow-hidden"
            data-testid="recurrence-ended"
          >
            <header
              class="flex items-center justify-between border-b border-gray-100 px-4 py-2 text-sm dark:border-slate-800"
            >
              <span class="text-gray-600 dark:text-gray-400">
                {{ stopped.length }}
                {{
                  stopped.length > 1 ? 'charges terminées' : 'charge terminée'
                }}
              </span>
              <span class="tabular-nums text-gray-600 dark:text-gray-400">
                {{ formatCurrency(stoppedTotal) }} payés au total
              </span>
            </header>
            <ul class="divide-y divide-gray-100 dark:divide-slate-800">
              <li
                v-for="row in stopped"
                :key="row.id"
                class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid="ended-row"
              >
                <RecurrenceNameEditor
                  v-if="editingKey === rowKey(row)"
                  :name="row.name"
                  :named="row.named"
                  :saving="busyKey !== null"
                  @save="name => rename(row, name)"
                  @cancel="editingKey = null"
                />
                <button
                  v-else
                  type="button"
                  class="min-w-0 flex-1 text-left"
                  :aria-label="`Voir les transactions de ${row.name}`"
                  @click="openTransactions(row)"
                >
                  <span class="flex min-w-0 items-center gap-1.5">
                    <span
                      class="truncate font-medium text-gray-900 hover:underline dark:text-gray-100"
                      data-testid="recurrence-name"
                      >{{ row.name }}</span
                    >
                    <DivisorBadge :divisor="row.divisor" />
                  </span>
                  <span
                    v-if="row.name !== row.label"
                    class="block truncate text-[11px] text-gray-400 dark:text-gray-500"
                    >{{ row.label }}</span
                  >
                  <span
                    class="block truncate text-xs text-gray-500 dark:text-gray-400"
                  >
                    {{
                      row.subcategoryName ??
                      row.categoryName ??
                      'Sans catégorie'
                    }}
                    · {{ formatMonthInline(row.firstDate) }} →
                    {{ formatMonthInline(row.lastDate) }} ·
                    {{ formatDuration(row) }}
                  </span>
                </button>
                <div
                  class="flex items-center justify-between gap-4 sm:justify-end"
                >
                  <div class="text-right">
                    <span
                      class="block tabular-nums font-medium text-gray-900 dark:text-gray-100"
                      >{{ formatCurrency(row.totalPaid) }}</span
                    >
                    <span
                      class="block text-xs tabular-nums text-gray-500 dark:text-gray-400"
                      >dernier tarif {{ formatCurrency(row.amount) }}
                      {{ PERIOD_LABELS[row.period] }}</span
                    >
                  </div>
                  <BaseIconButton
                    :disabled="busyKey !== null"
                    :label="`Renommer ${row.name}`"
                    data-testid="rename-recurrence"
                    @click="editingKey = rowKey(row)"
                  >
                    <IconPencil />
                  </BaseIconButton>
                  <BaseIconButton
                    variant="danger"
                    :disabled="busyKey !== null"
                    :label="`Écarter ${row.name} : ce n'est pas un abonnement`"
                    data-testid="dismiss-recurrence"
                    @click="decide(row, 'DISMISSED')"
                  >
                    <IconClose />
                  </BaseIconButton>
                </div>
              </li>
            </ul>
          </BaseCard>
        </template>

        <BaseCard
          v-if="dismissed.length > 0"
          padding="sm"
          class="mb-4"
          data-testid="recurrence-dismissed"
        >
          <summary
            class="cursor-pointer text-sm font-semibold text-gray-800 dark:text-gray-200"
          >
            Écartées ({{ dismissed.length }})
          </summary>
          <ul class="mt-2 divide-y divide-gray-100 dark:divide-slate-800">
            <li
              v-for="subscription in dismissed"
              :key="subscription.id"
              class="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <span class="truncate text-gray-700 dark:text-gray-300">
                {{ subscription.name }}
              </span>
              <BaseButton
                size="sm"
                variant="tinted"
                :disabled="busyKey !== null"
                data-testid="restore-recurrence"
                @click="forget(subscription, 'Récurrence rétablie')"
              >
                Rétablir
              </BaseButton>
            </li>
          </ul>
        </BaseCard>

        <section
          v-if="orphans.length > 0"
          class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
          data-testid="recurrence-orphans"
        >
          <h2 class="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Suivis sans échéance retrouvée ({{ orphans.length }})
          </h2>
          <p class="mb-2 text-xs text-amber-800 dark:text-amber-300">
            Vous suivez ces abonnements, mais aucune dépense ne leur correspond
            plus : leurs transactions ont peut-être été supprimées ou
            reclassées. Oubliez-les, ou rattachez-leur un paiement depuis la
            page Transactions.
          </p>
          <ul class="divide-y divide-amber-100 dark:divide-amber-800/50">
            <li
              v-for="subscription in orphans"
              :key="subscription.id"
              class="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <span class="truncate text-gray-800 dark:text-gray-200">
                {{ subscription.name }}
              </span>
              <BaseButton
                size="sm"
                variant="secondary"
                :disabled="busyKey !== null"
                data-testid="forget-orphan"
                @click="forget(subscription, `« ${subscription.name} » oublié`)"
              >
                Oublier
              </BaseButton>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </PageShell>
</template>
