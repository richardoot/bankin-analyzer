<script setup lang="ts">
  import { computed, ref, useId } from 'vue'
  import { useModalA11y } from '@/composables/useModalA11y'

  /**
   * The shared modal shell: teleport, backdrop, panel, title bar, and the
   * keyboard behavior every dialog owes its user (Escape, focus trap, focus
   * return — via useModalA11y). A dialog built on it only writes its body
   * and its footer.
   *
   * Sixteen layers each respelled this markup; new dialogs start here, and
   * the confirm-style ones have already moved.
   */
  const props = withDefaults(
    defineProps<{
      open: boolean
      title?: string | undefined
      maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | undefined
      /** When closing must wait (a request in flight), the caller says so. */
      closable?: boolean | undefined
    }>(),
    { maxWidth: 'md', closable: true }
  )

  const emit = defineEmits<{ close: [] }>()

  const titleId = useId()
  const panelRef = ref<HTMLElement | null>(null)

  function requestClose(): void {
    if (props.closable) emit('close')
  }

  useModalA11y({
    isOpen: () => props.open,
    onClose: requestClose,
    panel: panelRef,
  })

  const WIDTHS: Record<NonNullable<typeof props.maxWidth>, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  }

  const widthClass = computed(() => WIDTHS[props.maxWidth])
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div class="fixed inset-0 bg-black/50" @click="requestClose" />

      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : undefined"
        class="relative z-10 w-full rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900 dark:shadow-slate-900/30"
        :class="widthClass"
      >
        <div
          v-if="title || $slots.header"
          class="mb-4 flex items-start justify-between gap-4"
        >
          <slot name="header">
            <h2
              :id="titleId"
              class="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              {{ title }}
            </h2>
          </slot>
          <button
            v-if="closable"
            type="button"
            aria-label="Fermer"
            class="-m-1 rounded-md p-1 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            @click="requestClose"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <slot />

        <div v-if="$slots.footer" class="mt-6 flex justify-end gap-3">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
