<script setup lang="ts">
  import { computed } from 'vue'
  import type { TagEventStatus } from '@/lib/api'

  /**
   * Where an event stands today: still to come, under way, or over. The
   * word carries the meaning; the colour only echoes it.
   */
  const props = defineProps<{ status: TagEventStatus }>()

  const LOOKS: Record<TagEventStatus, { label: string; classes: string }> = {
    upcoming: {
      label: 'À venir',
      classes:
        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    },
    ongoing: {
      label: 'En cours',
      classes:
        'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
    },
    past: {
      label: 'Passé',
      classes: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300',
    },
  }

  const look = computed(() => LOOKS[props.status])
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
    :class="look.classes"
    :data-status="status"
    data-testid="tag-status-badge"
  >
    {{ look.label }}
  </span>
</template>
