<script setup lang="ts">
  import { computed, ref, useId, watch } from 'vue'
  import { useModalA11y } from '@/composables/useModalA11y'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import IconArrowLeft from '@/components/icons/IconArrowLeft.vue'
  import IconClose from '@/components/icons/IconClose.vue'
  import IconWarning from '@/components/icons/IconWarning.vue'

  /**
   * The shared modal shell: teleport, backdrop, panel, title bar, and the
   * keyboard behavior every dialog owes its user (Escape, focus trap, focus
   * return — via useModalA11y). A dialog built on it only writes its body
   * and its footer.
   *
   * The panel never outgrows the viewport: it caps at 90dvh (or fills it
   * with `tall`, for a picker whose height must not jump with its list)
   * and the body scrolls inside it. On a phone it rises from the bottom
   * edge as a sheet, the footer buttons stack primary on top, and the
   * safe area is respected.
   *
   * The header is declarative: `title` and `subtitle` name the dialog
   * (`aria-labelledby` follows), `tone` adds the warning badge a
   * destructive dialog opens on, `backLabel` adds the arrow a wizard's
   * later steps need, and `#subheader` holds what stays fixed under the
   * title while the body scrolls — a step indicator, a search field.
   *
   * `dirty` is the guard for a draft: with it set, the backdrop, the cross
   * and Escape no longer close the dialog outright but ask first, in a
   * small dialog stacked on top. Closing is confirmed by emitting `close`
   * exactly as it would have been — the parent resets as usual.
   *
   * Attributes fall through to the panel, so a `data-testid` names the
   * dialog element itself.
   */
  defineOptions({ inheritAttrs: false })

  const props = withDefaults(
    defineProps<{
      open: boolean
      title?: string | undefined
      subtitle?: string | undefined
      maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | undefined
      /** When closing must wait (a request in flight), the caller says so. */
      closable?: boolean | undefined
      /**
       * The id of the element naming the dialog, when it is not `title` —
       * a dialog drawing its own heading (ConfirmDialog, a custom header).
       */
      labelledBy?: string | undefined
      /** A badge before the title: red for destruction, amber for a warning. */
      tone?: 'neutral' | 'danger' | 'warning' | undefined
      /** Shows a back arrow at the start of the header; the click emits `back`. */
      backLabel?: string | undefined
      /** A test id for the back arrow, when a spec drives it. */
      backTestId?: string | undefined
      /** The dialog holds a draft: closing it asks for confirmation first. */
      dirty?: boolean | undefined
      /** The sentence the confirmation shows, when the default does not fit. */
      dirtyMessage?: string | undefined
      /** Fill the viewport height instead of fitting the content. */
      tall?: boolean | undefined
    }>(),
    {
      title: undefined,
      subtitle: undefined,
      maxWidth: 'md',
      closable: true,
      labelledBy: undefined,
      tone: 'neutral',
      backLabel: undefined,
      backTestId: undefined,
      dirty: false,
      dirtyMessage: 'Ce que vous avez saisi sera perdu si vous fermez.',
      tall: false,
    }
  )

  const emit = defineEmits<{ close: []; back: [] }>()

  const titleId = useId()
  const panelRef = ref<HTMLElement | null>(null)
  const confirmingClose = ref(false)

  function requestClose(): void {
    if (!props.closable) return
    if (props.dirty) {
      confirmingClose.value = true
      return
    }
    emit('close')
  }

  function discardAndClose(): void {
    confirmingClose.value = false
    emit('close')
  }

  // A dialog closed from outside while its guard is up must not leave the
  // guard behind for the next opening.
  watch(
    () => props.open,
    open => {
      if (!open) confirmingClose.value = false
    }
  )

  useModalA11y({
    isOpen: () => props.open,
    onClose: requestClose,
    panel: panelRef,
  })

  // A dialog's own « Annuler » button closes the way the cross does — through
  // the draft guard when there is one.
  defineExpose({ requestClose })

  const WIDTHS: Record<NonNullable<typeof props.maxWidth>, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    '2xl': 'max-w-3xl',
  }

  const TONES: Record<NonNullable<typeof props.tone>, string> = {
    neutral: '',
    danger: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    warning:
      'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  }

  const widthClass = computed(() => WIDTHS[props.maxWidth])
  const toneClass = computed(() => TONES[props.tone])
  const heightClass = computed(() =>
    props.tall ? 'h-[90dvh] sm:h-[85dvh]' : 'max-h-[90dvh]'
  )
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
    >
      <div class="fixed inset-0 bg-black/50" @click="requestClose" />

      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : labelledBy"
        class="relative z-10 flex w-full flex-col rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:p-6 sm:pb-6 dark:bg-slate-900 dark:shadow-slate-900/30"
        :class="[widthClass, heightClass]"
        v-bind="$attrs"
      >
        <div
          v-if="title || $slots.header || backLabel"
          class="mb-4 flex shrink-0 items-start gap-3"
        >
          <BaseIconButton
            v-if="backLabel"
            :label="backLabel"
            :data-testid="backTestId"
            class="-mt-1.5 -ml-2"
            @click="emit('back')"
          >
            <IconArrowLeft />
          </BaseIconButton>

          <div
            v-if="tone !== 'neutral'"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            :class="toneClass"
            data-testid="modal-tone"
          >
            <IconWarning class="h-6 w-6" />
          </div>

          <div class="min-w-0 flex-1">
            <slot name="header">
              <h2
                :id="titleId"
                class="text-lg font-semibold text-gray-900 dark:text-gray-100"
              >
                {{ title }}
              </h2>
              <p
                v-if="subtitle"
                class="mt-0.5 text-sm text-gray-500 dark:text-gray-400"
              >
                {{ subtitle }}
              </p>
            </slot>
          </div>

          <BaseIconButton
            v-if="closable"
            label="Fermer"
            class="-mt-1.5 -mr-2"
            @click="requestClose"
          >
            <IconClose />
          </BaseIconButton>
        </div>

        <div v-if="$slots.subheader" class="mb-4 shrink-0">
          <slot name="subheader" />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <slot />
        </div>

        <div
          v-if="$slots.footer || $slots['footer-start']"
          class="mt-5 flex shrink-0 flex-col gap-3 sm:mt-6 sm:flex-row sm:items-center"
        >
          <div
            v-if="$slots['footer-start']"
            class="min-w-0 text-sm sm:flex-1"
            data-testid="modal-footer-start"
          >
            <slot name="footer-start" />
          </div>
          <div
            v-if="$slots.footer"
            class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3"
            :class="$slots['footer-start'] ? 'sm:shrink-0' : 'sm:flex-1'"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!--
    The draft guard, stacked on top of the dialog it protects. Escape and the
    backdrop reach this one first; cancelling it leaves the draft where it
    was, confirming it closes the dialog underneath as if it had never asked.
  -->
  <BaseModal
    v-if="dirty"
    :open="confirmingClose"
    title="Modifications non enregistrées"
    max-width="sm"
    data-testid="modal-dirty-guard"
    @close="confirmingClose = false"
  >
    <p class="text-sm text-gray-600 dark:text-gray-400">
      {{ dirtyMessage }}
    </p>
    <template #footer>
      <BaseButton
        variant="secondary"
        class="flex-1"
        @click="confirmingClose = false"
      >
        Continuer la saisie
      </BaseButton>
      <BaseButton
        variant="danger"
        class="flex-1"
        data-testid="modal-dirty-discard"
        @click="discardAndClose"
      >
        Fermer sans enregistrer
      </BaseButton>
    </template>
  </BaseModal>
</template>
