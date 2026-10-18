<script setup lang="ts">
  import {
    computed,
    nextTick,
    onBeforeUnmount,
    ref,
    useId,
    watch,
    type Component,
  } from 'vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import IconDots from '@/components/icons/IconDots.vue'

  /**
   * A « … » button and the menu it opens: the actions a row offers on
   * demand, instead of a strip of affordances repeated on every line.
   *
   * It behaves like a menu button is expected to: the trigger says
   * whether it is expanded, the list is a `menu` of `menuitem`s, arrow
   * keys move through them (Home/End jump), Escape closes and hands the
   * keyboard back to the trigger, Tab or a click elsewhere closes. The
   * focused item is drawn, not only hovered, so a keyboard sees where it
   * is. The panel opens upward when the viewport has no room below.
   *
   * Picking an item emits `select` with its key; the parent acts.
   */
  export interface MenuItem {
    key: string
    label: string
    icon?: Component | undefined
    disabled?: boolean | undefined
    /** Drawn red: an item that removes or detaches something. */
    danger?: boolean | undefined
    testId?: string | undefined
  }

  const props = withDefaults(
    defineProps<{
      /** The trigger's accessible name. */
      label: string
      items: MenuItem[]
      size?: 'sm' | 'md' | undefined
      /** Which edge of the trigger the panel hangs from. */
      align?: 'start' | 'end' | undefined
      disabled?: boolean | undefined
    }>(),
    { size: 'sm', align: 'end', disabled: false }
  )

  const emit = defineEmits<{ select: [key: string] }>()

  const open = ref(false)
  const openUp = ref(false)
  const root = ref<HTMLElement | null>(null)
  const panel = ref<HTMLElement | null>(null)
  const trigger = ref<InstanceType<typeof BaseIconButton> | null>(null)
  const triggerId = useId()
  const menuId = `${triggerId}-menu`

  const enabledItems = computed(() => props.items.filter(i => !i.disabled))

  function itemButtons(): HTMLButtonElement[] {
    return Array.from(
      panel.value?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])'
      ) ?? []
    )
  }

  function focusItem(index: number): void {
    const buttons = itemButtons()
    if (buttons.length === 0) return
    const wrapped = (index + buttons.length) % buttons.length
    buttons[wrapped]?.focus()
  }

  function triggerEl(): HTMLElement | null {
    return (trigger.value?.$el as HTMLElement | undefined) ?? null
  }

  function show(focus: 'first' | 'last' | 'none'): void {
    if (props.disabled || enabledItems.value.length === 0) return
    const button = triggerEl()
    if (button && typeof window !== 'undefined') {
      const rect = button.getBoundingClientRect()
      const estimated = props.items.length * 40 + 16
      openUp.value =
        rect.bottom + estimated > window.innerHeight && rect.top > estimated
    }
    open.value = true
    if (focus !== 'none') {
      void nextTick(() => focusItem(focus === 'first' ? 0 : -1))
    }
  }

  function hide(returnFocus: boolean): void {
    if (!open.value) return
    open.value = false
    if (returnFocus) triggerEl()?.focus()
  }

  function toggle(): void {
    if (open.value) hide(true)
    else show('first')
  }

  function onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      show('first')
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      show('last')
    }
  }

  function onPanelKeydown(event: KeyboardEvent): void {
    const buttons = itemButtons()
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusItem(current + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusItem(current - 1)
        break
      case 'Home':
        event.preventDefault()
        focusItem(0)
        break
      case 'End':
        event.preventDefault()
        focusItem(-1)
        break
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        hide(true)
        break
      case 'Tab':
        // Let the focus travel on; the menu simply is not there any more.
        hide(false)
        break
      default:
        break
    }
  }

  function pick(item: MenuItem): void {
    if (item.disabled) return
    hide(true)
    emit('select', item.key)
  }

  function onDocMouseDown(event: MouseEvent): void {
    if (root.value && !root.value.contains(event.target as Node)) hide(false)
  }

  function onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null
    if (next && root.value && !root.value.contains(next)) hide(false)
  }

  watch(open, isOpen => {
    if (isOpen) document.addEventListener('mousedown', onDocMouseDown)
    else document.removeEventListener('mousedown', onDocMouseDown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocMouseDown)
  })

  defineExpose({ open: () => show('first'), close: () => hide(false) })
</script>

<template>
  <div ref="root" class="relative inline-flex" @focusout="onFocusOut">
    <BaseIconButton
      :id="triggerId"
      ref="trigger"
      :label="label"
      :size="size"
      :disabled="disabled"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <slot name="icon"><IconDots /></slot>
    </BaseIconButton>

    <div
      v-if="open"
      :id="menuId"
      ref="panel"
      role="menu"
      :aria-labelledby="triggerId"
      class="absolute z-30 min-w-[12rem] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
      :class="[
        align === 'end' ? 'right-0' : 'left-0',
        openUp ? 'bottom-full mb-1' : 'top-full mt-1',
      ]"
      @keydown="onPanelKeydown"
    >
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        role="menuitem"
        tabindex="-1"
        :disabled="item.disabled"
        :data-testid="item.testId"
        class="flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors pointer-coarse:min-h-[44px] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        :class="
          item.danger
            ? 'text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 dark:focus:bg-red-900/20'
            : 'text-gray-700 hover:bg-gray-100 focus:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-700 dark:focus:bg-slate-700'
        "
        @click="pick(item)"
      >
        <component
          :is="item.icon"
          v-if="item.icon"
          class="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
          :class="item.danger ? 'text-red-500 dark:text-red-400' : ''"
        />
        {{ item.label }}
      </button>
    </div>
  </div>
</template>
