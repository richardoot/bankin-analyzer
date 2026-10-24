<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { api } from '@/lib/api'
  import PageShell from '@/components/ui/PageShell.vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import ReadingMenu from '@/components/dashboard/ReadingMenu.vue'
  import SpendingTrendsCard from '@/components/dashboard/SpendingTrendsCard.vue'
  import { useDashboardData } from '@/composables/useDashboardData'

  /**
   * « Tendances »: the full « Ce qui change » card, out of the dashboard
   * (agent-os/product/dashboard-refonte.md, lot 2). The month selector, the
   * window, the tabs, the paragraph and the horizons live here; the
   * dashboard keeps the lead sentence and three tiles.
   *
   * The reading and the switches come from the same owners as on the
   * dashboard: the reading from useDashboardData (remembered in this
   * browser), the « en attente » switch from the filters store. The summary
   * itself is never asked here: useDashboardData only fetches when told to.
   */
  const {
    breakdownMode,
    setBreakdownMode,
    deductReimbursements,
    deductPendingReimbursements,
    pendingPreferenceSyncError,
  } = useDashboardData()

  const breakdownModeModel = computed({
    get: () => breakdownMode.value,
    set: setBreakdownMode,
  })

  const subtitle = computed(() =>
    breakdownMode.value === 'everyday'
      ? 'Ce qui change dans la vie courante'
      : 'Ce qui change dans toutes les dépenses'
  )

  /** The expense categories' names by id: a tile names a subcategory's parent. */
  const categoryNames = ref<Record<string, string>>({})

  onMounted(async () => {
    try {
      const categories = await api.getCategories()
      categoryNames.value = Object.fromEntries(
        categories.filter(c => c.type === 'EXPENSE').map(c => [c.id, c.name])
      )
    } catch {
      // Without the names a subcategory tile only drops its parent's name.
    }
  })
</script>

<template>
  <PageShell width="wide" data-testid="trends-page">
    <PageHeader title="Tendances" :subtitle="subtitle">
      <template #actions>
        <!-- The same reading as the dashboard's. Events may touch any
             month read here: the choice is always offered. -->
        <ReadingMenu
          v-model:breakdown-mode="breakdownModeModel"
          v-model:deduct-reimbursements="deductReimbursements"
          v-model:deduct-pending-reimbursements="deductPendingReimbursements"
          :has-exceptional-expenses="true"
          :pending-sync-error="pendingPreferenceSyncError"
        />
      </template>
    </PageHeader>

    <SpendingTrendsCard
      :reading="breakdownMode"
      :deduct-reimbursements="deductReimbursements"
      :deduct-pending-reimbursements="deductPendingReimbursements"
      :category-names="categoryNames"
    />
  </PageShell>
</template>
