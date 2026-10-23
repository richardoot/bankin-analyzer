<script setup lang="ts">
  import { computed, ref, useId } from 'vue'
  import { RouterLink } from 'vue-router'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import IconArrowRight from '@/components/icons/IconArrowRight.vue'
  import { TODO_SHOWN, type TodoItem } from '@/lib/todo'

  /**
   * « À faire » (agent-os/product/dashboard-refonte.md, lot 3): one line per
   * thing to do, its sentence on the left, « Voir → » on the right, the
   * whole line a link — 44px high, so a thumb takes it anywhere. Four lines,
   * then « et N autres » unfolds the rest in place. Amber is the title's
   * only: the one colour of the card. Nothing to do, nothing rendered — the
   * page never has to ask.
   */
  const props = defineProps<{
    items: readonly TodoItem[]
  }>()

  const listId = useId()
  const expanded = ref(false)

  const hiddenCount = computed(() =>
    Math.max(0, props.items.length - TODO_SHOWN)
  )
  const shown = computed(() =>
    expanded.value ? props.items : props.items.slice(0, TODO_SHOWN)
  )
  const moreLabel = computed(() =>
    expanded.value
      ? 'Replier'
      : `et ${hiddenCount.value} ${hiddenCount.value >= 2 ? 'autres' : 'autre'}`
  )
</script>

<template>
  <BaseCard
    v-if="items.length > 0"
    as="section"
    data-testid="todo-card"
    aria-labelledby="todo-card-title"
  >
    <h2
      id="todo-card-title"
      class="mb-2 text-lg font-semibold text-amber-700 dark:text-amber-400"
    >
      À faire
    </h2>

    <ul :id="listId" class="divide-y divide-gray-100 dark:divide-slate-800">
      <li v-for="todo in shown" :key="todo.key">
        <RouterLink
          :to="todo.to"
          class="group -mx-2 flex min-h-11 items-center justify-between gap-3 rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-300 dark:hover:bg-slate-800/60"
          :data-testid="todo.testId"
        >
          <span class="min-w-0 tabular-nums">{{ todo.text }}</span>
          <span
            class="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary-700 group-hover:underline underline-offset-2 dark:text-primary-400"
          >
            Voir
            <IconArrowRight class="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </RouterLink>
      </li>
    </ul>

    <button
      v-if="hiddenCount > 0"
      type="button"
      class="mt-1 inline-flex min-h-11 items-center rounded text-sm font-medium text-primary-700 hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400"
      :aria-expanded="expanded"
      :aria-controls="listId"
      data-testid="todo-more"
      @click="expanded = !expanded"
    >
      {{ moreLabel }}
    </button>
  </BaseCard>
</template>
