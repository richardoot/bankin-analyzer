<script setup lang="ts">
  import { RouterLink } from 'vue-router'
  import type { TagDto } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import IconChevronRight from '@/components/icons/IconChevronRight.vue'
  import IconPencil from '@/components/icons/IconPencil.vue'
  import IconTrash from '@/components/icons/IconTrash.vue'
  import TagStatusBadge from '@/components/tags/TagStatusBadge.vue'
  import { transactionsLink } from '@/lib/transactionsLink'

  /**
   * One tag on the tags page: an article, with its own link and its own
   * actions — not a button wrapped around blocks, with controls hidden
   * until hovered. A dated tag says where it stands today; a tag nobody
   * has used yet says so rather than linking to an empty list.
   */
  defineProps<{ tag: TagDto }>()

  const emit = defineEmits<{
    (e: 'edit'): void
    (e: 'delete'): void
  }>()

  /** "12 juil. – 26 juil. 2025" */
  function formatPeriod(start: string, end: string): string {
    const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }
    const from = new Date(start).toLocaleDateString('fr-FR', opts)
    const to = new Date(end).toLocaleDateString('fr-FR', {
      ...opts,
      year: 'numeric',
    })
    return `${from} – ${to}`
  }
</script>

<template>
  <BaseCard
    as="article"
    padding="sm"
    class="flex flex-col gap-2"
    :data-testid="`tag-card-${tag.name}`"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <span
          class="inline-block h-3 w-3 shrink-0 rounded-full"
          :style="{ backgroundColor: tag.color ?? '#9ca3af' }"
        ></span>
        <h3
          class="truncate font-semibold text-gray-900 dark:text-gray-100"
          :title="tag.name"
        >
          {{ tag.name }}
        </h3>
      </div>
      <div class="flex shrink-0 items-center">
        <BaseIconButton
          size="sm"
          :label="`Modifier ${tag.name}`"
          :data-testid="`edit-tag-${tag.name}`"
          @click="emit('edit')"
        >
          <IconPencil />
        </BaseIconButton>
        <BaseIconButton
          size="sm"
          variant="danger"
          :label="`Supprimer ${tag.name}`"
          @click="emit('delete')"
        >
          <IconTrash />
        </BaseIconButton>
      </div>
    </div>
    <p class="text-sm text-gray-500 dark:text-gray-400">
      <TransactionsLink
        v-if="tag.transactionCount > 0"
        :to="transactionsLink({ tagId: tag.id, label: tag.name })"
        :subject="tag.name"
        size="md"
        :data-testid="`tag-transactions-link-${tag.id}`"
      >
        {{ tag.transactionCount }} transaction(s)
      </TransactionsLink>
      <span v-else :data-testid="`tag-empty-${tag.id}`">
        Aucune transaction
      </span>
    </p>
    <div
      v-if="tag.isExceptional || tag.status"
      class="flex flex-wrap items-center gap-1.5"
    >
      <TagStatusBadge v-if="tag.status" :status="tag.status" />
      <span
        v-if="tag.isExceptional"
        class="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
      >
        Exceptionnel
      </span>
      <span
        v-if="tag.eventStartDate && tag.eventEndDate"
        class="text-[11px] text-gray-500 dark:text-gray-400"
      >
        {{ formatPeriod(tag.eventStartDate, tag.eventEndDate) }}
      </span>
      <span
        v-if="tag.budgetAmount !== null"
        :data-testid="`tag-budget-${tag.name}`"
        class="inline-flex shrink-0 items-center rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-primary-700 dark:bg-primary-900/40 dark:text-primary-400"
      >
        Enveloppe {{ formatCurrency(tag.budgetAmount) }}
      </span>
    </div>
    <RouterLink
      :to="{ name: 'tag-analysis', params: { id: tag.id } }"
      class="mt-auto inline-flex min-h-[44px] items-center gap-1 self-start text-sm font-medium text-primary-700 hover:underline sm:min-h-0 dark:text-primary-400"
      :data-testid="`analyse-tag-${tag.name}`"
    >
      Analyser
      <IconChevronRight class="h-3.5 w-3.5" />
    </RouterLink>
  </BaseCard>
</template>
