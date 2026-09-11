import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useModalA11y } from './useModalA11y'

/**
 * Harness: a component whose openness and close callback are handed in, the
 * way a real modal hands its `isOpen` prop and `close` emit to the
 * composable.
 */
function makeHarness(open: Ref<boolean>, onClose: () => void) {
  return defineComponent({
    setup() {
      const panel = ref<HTMLElement | null>(null)
      useModalA11y({ isOpen: () => open.value, onClose, panel })
      return () =>
        open.value
          ? h('div', { ref: panel }, [h('button', 'ok')])
          : h('div', 'closed')
    },
  })
}

function pressEscape(): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  )
}

describe('useModalA11y', () => {
  it('closes on Escape while open', async () => {
    const open = ref(true)
    const onClose = vi.fn()
    const wrapper = mount(makeHarness(open, onClose))

    pressEscape()
    expect(onClose).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('ignores Escape while closed', () => {
    const open = ref(false)
    const onClose = vi.fn()
    const wrapper = mount(makeHarness(open, onClose))

    pressEscape()
    expect(onClose).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('sends Escape to the topmost dialog only', async () => {
    // A settlement modal opening a confirmation on top: one keypress must
    // close the confirmation, not both layers.
    const openBottom = ref(true)
    const closeBottom = vi.fn()
    const bottom = mount(makeHarness(openBottom, closeBottom))

    const openTop = ref(true)
    const closeTop = vi.fn()
    const top = mount(makeHarness(openTop, closeTop))

    pressEscape()
    expect(closeTop).toHaveBeenCalledTimes(1)
    expect(closeBottom).not.toHaveBeenCalled()

    // The top layer actually closes; the next Escape reaches the bottom one.
    openTop.value = false
    await top.vm.$nextTick()
    pressEscape()
    expect(closeBottom).toHaveBeenCalledTimes(1)

    top.unmount()
    bottom.unmount()
  })

  it('locks background scroll while open and releases it after', async () => {
    const open = ref(false)
    const wrapper = mount(makeHarness(open, () => {}))

    expect(document.body.style.overflow).not.toBe('hidden')
    open.value = true
    await wrapper.vm.$nextTick()
    expect(document.body.style.overflow).toBe('hidden')

    open.value = false
    await wrapper.vm.$nextTick()
    expect(document.body.style.overflow).not.toBe('hidden')
    wrapper.unmount()
  })

  it('releases the scroll lock when unmounted while open', async () => {
    const open = ref(true)
    const wrapper = mount(makeHarness(open, () => {}))
    await wrapper.vm.$nextTick()
    expect(document.body.style.overflow).toBe('hidden')

    wrapper.unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})
