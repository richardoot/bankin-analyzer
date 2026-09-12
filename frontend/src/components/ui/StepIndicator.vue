<script setup lang="ts">
  /**
   * Where am I, how much is left: a numbered trail for a flow that spans
   * screens. Steps behind the current one show a check, the current one is
   * filled, the ones ahead stay muted.
   */
  defineProps<{
    steps: string[]
    /** 1-based index of the current step. */
    current: number
  }>()
</script>

<template>
  <ol class="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
    <li
      v-for="(step, index) in steps"
      :key="step"
      class="flex items-center gap-1 sm:gap-2"
    >
      <div
        class="flex items-center gap-1.5 sm:gap-2"
        :aria-current="index + 1 === current ? 'step' : undefined"
      >
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          :class="
            index + 1 < current
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
              : index + 1 === current
                ? 'bg-primary-600 text-white dark:bg-primary-500'
                : 'bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-gray-500'
          "
        >
          <svg
            v-if="index + 1 < current"
            class="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
          <template v-else>{{ index + 1 }}</template>
        </span>
        <span
          class="text-xs font-medium sm:text-sm"
          :class="
            index + 1 === current
              ? 'text-gray-900 dark:text-gray-100'
              : 'text-gray-500 dark:text-gray-400'
          "
        >
          {{ step }}
        </span>
      </div>
      <svg
        v-if="index < steps.length - 1"
        class="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </li>
  </ol>
</template>
