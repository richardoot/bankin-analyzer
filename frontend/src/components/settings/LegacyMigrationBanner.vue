<script setup lang="ts">
  /**
   * The nudge that stays until nothing legacy remains: categories from
   * before the catalogue still hold transactions, and the assistant is where
   * that gets fixed. Given the count when the parent already knows it;
   * fetches it otherwise, and renders nothing while there is nothing to say.
   */
  import { computed, onMounted, ref } from 'vue'
  import { api } from '@/lib/api'

  const props = defineProps<{
    /** Legacy categories, when the parent already counted them. */
    count?: number | undefined
    /** Transactions still filed under them, when known. */
    transactionCount?: number | undefined
  }>()

  const fetched = ref<{ count: number; transactionCount: number } | null>(null)

  onMounted(async () => {
    if (props.count !== undefined) return
    try {
      const overview = await api.getLegacyCategories()
      fetched.value = {
        count: overview.categories.length,
        transactionCount: overview.totalTransactions,
      }
    } catch (err) {
      // A banner that cannot load is a banner that stays out of the way.
      console.error('Failed to load legacy categories:', err)
    }
  })

  const count = computed(() => props.count ?? fetched.value?.count ?? 0)
  const transactionCount = computed(
    () => props.transactionCount ?? fetched.value?.transactionCount
  )
</script>

<template>
  <div
    v-if="count > 0"
    role="status"
    data-testid="legacy-migration-banner"
    class="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
  >
    <p>
      <strong>{{ count }}</strong>
      catégorie{{ count > 1 ? 's' : '' }} à ranger dans le catalogue
      <template v-if="transactionCount !== undefined">
        ({{ transactionCount }} transaction{{
          transactionCount > 1 ? 's' : ''
        }})
      </template>
      : catégories d'avant le catalogue, ou sous-catégories laissées à côté des
      siennes.
    </p>
    <RouterLink
      to="/settings/categories/migration"
      class="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 sm:min-h-0"
    >
      Ouvrir l'assistant
    </RouterLink>
  </div>
</template>
