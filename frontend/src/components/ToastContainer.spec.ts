import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ToastContainer from './ToastContainer.vue'
import { useToast } from '@/composables/useToast'

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    const { toasts, remove } = useToast()
    toasts.value.forEach(t => remove(t.id))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('announces an error as an alert and a confirmation as a status', async () => {
    const wrapper = mount(ToastContainer)
    const toast = useToast()
    toast.error('Échec')
    toast.success('Fait')
    await wrapper.vm.$nextTick()

    const roles = wrapper
      .findAll('[data-testid="toast"]')
      .map(t => t.attributes('role'))
    expect(roles).toEqual(['alert', 'status'])
  })

  it('gives the close button a name and closes on click', async () => {
    const wrapper = mount(ToastContainer)
    useToast().info('Info')
    await wrapper.vm.$nextTick()

    const close = wrapper.get('[data-testid="toast-close"]')
    expect(close.attributes('aria-label')).toBe('Fermer la notification')
    await close.trigger('click')

    expect(wrapper.findAll('[data-testid="toast"]')).toHaveLength(0)
  })

  it('holds a toast while the pointer is on it', async () => {
    const wrapper = mount(ToastContainer)
    useToast().success('Lisez-moi')
    await wrapper.vm.$nextTick()

    await wrapper.get('[data-testid="toast"]').trigger('mouseenter')
    vi.advanceTimersByTime(20000)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[data-testid="toast"]')).toHaveLength(1)

    await wrapper.get('[data-testid="toast"]').trigger('mouseleave')
    vi.advanceTimersByTime(4000)
    await wrapper.vm.$nextTick()
    expect(useToast().toasts.value).toHaveLength(0)
  })

  it('spans the phone width and clears the home indicator and the tab bar', () => {
    const wrapper = mount(ToastContainer)
    const classes = wrapper.get('[aria-live="polite"]').classes()
    expect(classes).toEqual(
      expect.arrayContaining(['left-4', 'right-4', 'sm:left-auto'])
    )
    expect(classes.join(' ')).toContain('safe-area-inset-bottom')
    expect(classes.join(' ')).toContain('var(--tab-bar-space)')
  })
})
