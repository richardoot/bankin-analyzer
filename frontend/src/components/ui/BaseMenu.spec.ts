import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseMenu from './BaseMenu.vue'

const items = [
  { key: 'note', label: 'Ajouter une note', testId: 'item-note' },
  { key: 'tag', label: 'Ajouter une étiquette', testId: 'item-tag' },
  { key: 'off', label: 'Indisponible', disabled: true, testId: 'item-off' },
  { key: 'unlink', label: 'Détacher', danger: true, testId: 'item-unlink' },
]

function mountMenu(props: Record<string, unknown> = {}) {
  return mount(BaseMenu, {
    props: { label: 'Actions', items, ...props },
    attachTo: document.body,
  })
}

describe('BaseMenu', () => {
  it('is a named menu button, closed until clicked', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.get('button[aria-haspopup="menu"]')

    expect(trigger.attributes('aria-label')).toBe('Actions')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)

    await trigger.trigger('click')
    await nextTick()

    expect(trigger.attributes('aria-expanded')).toBe('true')
    const menu = wrapper.get('[role="menu"]')
    expect(menu.attributes('aria-labelledby')).toBe(trigger.attributes('id'))
    expect(trigger.attributes('aria-controls')).toBe(menu.attributes('id'))
    expect(menu.findAll('[role="menuitem"]').map(i => i.text())).toEqual([
      'Ajouter une note',
      'Ajouter une étiquette',
      'Indisponible',
      'Détacher',
    ])
    // The keyboard lands on the first item as the menu opens.
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="item-note"]').element
    )
    wrapper.unmount()
  })

  it('emits the picked key, closes and hands the keyboard back', async () => {
    const wrapper = mountMenu()
    await wrapper.get('button[aria-haspopup="menu"]').trigger('click')
    await nextTick()

    await wrapper.get('[data-testid="item-tag"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['tag']])
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(
      wrapper.get('button[aria-haspopup="menu"]').element
    )
    wrapper.unmount()
  })

  it('moves with the arrows, skipping a disabled item, and wraps around', async () => {
    const wrapper = mountMenu()
    await wrapper.get('button[aria-haspopup="menu"]').trigger('click')
    await nextTick()
    const menu = wrapper.get('[role="menu"]')
    const active = () => (document.activeElement as HTMLElement).dataset.testid

    await menu.trigger('keydown', { key: 'ArrowDown' })
    expect(active()).toBe('item-tag')
    await menu.trigger('keydown', { key: 'ArrowDown' })
    expect(active()).toBe('item-unlink')
    await menu.trigger('keydown', { key: 'ArrowDown' })
    expect(active()).toBe('item-note')
    await menu.trigger('keydown', { key: 'End' })
    expect(active()).toBe('item-unlink')
    await menu.trigger('keydown', { key: 'Home' })
    expect(active()).toBe('item-note')
    await menu.trigger('keydown', { key: 'ArrowUp' })
    expect(active()).toBe('item-unlink')
    wrapper.unmount()
  })

  it('opens on the last item with ArrowUp from the trigger', async () => {
    const wrapper = mountMenu()
    await wrapper
      .get('button[aria-haspopup="menu"]')
      .trigger('keydown', { key: 'ArrowUp' })
    await nextTick()
    expect((document.activeElement as HTMLElement).dataset.testid).toBe(
      'item-unlink'
    )
    wrapper.unmount()
  })

  it('closes on Escape and refocuses the trigger, without picking anything', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.get('button[aria-haspopup="menu"]')
    await trigger.trigger('click')
    await nextTick()

    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' })

    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('closes when the pointer goes down elsewhere', async () => {
    const wrapper = mountMenu()
    await wrapper.get('button[aria-haspopup="menu"]').trigger('click')
    await nextTick()

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await nextTick()

    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('draws a destructive item red and never picks a disabled one', async () => {
    const wrapper = mountMenu()
    await wrapper.get('button[aria-haspopup="menu"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="item-unlink"]').classes()).toContain(
      'text-red-600'
    )
    const off = wrapper.get('[data-testid="item-off"]')
    expect(off.attributes('disabled')).toBeDefined()
    await off.trigger('click')
    expect(wrapper.emitted('select')).toBeUndefined()
    wrapper.unmount()
  })

  it('stays shut with nothing to offer', async () => {
    const wrapper = mountMenu({
      items: [{ key: 'x', label: 'x', disabled: true }],
    })
    await wrapper.get('button[aria-haspopup="menu"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
