<script setup lang="ts">
  import { computed } from 'vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import IconCheckCircle from '@/components/icons/IconCheckCircle.vue'
  import IconInfo from '@/components/icons/IconInfo.vue'
  import IconWarning from '@/components/icons/IconWarning.vue'
  import IconXCircle from '@/components/icons/IconXCircle.vue'

  /**
   * A message that belongs to the page, not to a toast: a load that
   * failed, a warning about the data on screen, a note. An error is
   * announced at once (`role="alert"`); the rest wait their turn
   * (`role="status"`). When something can be tried again, `retryLabel`
   * puts the button inside the message, with `retrying` to show the
   * attempt in flight — a dead end with no way out is the bug this
   * brick exists to prevent.
   */
  const props = withDefaults(
    defineProps<{
      variant?: 'error' | 'warning' | 'info' | 'success' | undefined
      title?: string | undefined
      retryLabel?: string | undefined
      retrying?: boolean | undefined
    }>(),
    {
      variant: 'error',
      title: undefined,
      retryLabel: undefined,
      retrying: false,
    }
  )

  const emit = defineEmits<{ retry: [] }>()

  const VARIANTS: Record<
    NonNullable<typeof props.variant>,
    { box: string; icon: typeof IconInfo }
  > = {
    error: {
      box: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400',
      icon: IconXCircle,
    },
    warning: {
      box: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
      icon: IconWarning,
    },
    info: {
      box: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      icon: IconInfo,
    },
    success: {
      box: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300',
      icon: IconCheckCircle,
    },
  }

  const role = computed(() => (props.variant === 'error' ? 'alert' : 'status'))
  const boxClass = computed(() => VARIANTS[props.variant].box)
  const icon = computed(() => VARIANTS[props.variant].icon)
</script>

<template>
  <div
    :role="role"
    class="flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center"
    :class="boxClass"
  >
    <component :is="icon" class="hidden h-5 w-5 shrink-0 sm:block" />
    <div class="min-w-0 flex-1">
      <p v-if="title" class="font-medium">{{ title }}</p>
      <div :class="title ? 'mt-0.5' : ''">
        <slot />
      </div>
    </div>
    <div
      v-if="retryLabel || $slots.actions"
      class="flex shrink-0 flex-wrap items-center gap-2"
    >
      <slot name="actions" />
      <BaseButton
        v-if="retryLabel"
        variant="secondary"
        size="sm"
        :loading="retrying"
        @click="emit('retry')"
      >
        {{ retryLabel }}
      </BaseButton>
    </div>
  </div>
</template>
