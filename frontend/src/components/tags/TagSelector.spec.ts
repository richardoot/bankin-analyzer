import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import TagSelector from './TagSelector.vue'
import type { TagDto } from '@/lib/api'

const tag: TagDto = {
  id: 't1',
  name: 'Vacances',
  color: '#f59e0b',
  icon: null,
  transactionCount: 3,
  isExceptional: true,
  eventStartDate: null,
  eventEndDate: null,
  budgetAmount: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

enableAutoUnmount(afterEach)

async function mountOpen() {
  const wrapper = mount(TagSelector, {
    props: { selectedTagIds: [], tags: [tag] },
    attachTo: document.body,
  })
  await wrapper
    .get('button[aria-label="Ajouter une étiquette"]')
    .trigger('click')
  return wrapper
}

const isOpen = (wrapper: Awaited<ReturnType<typeof mountOpen>>) =>
  wrapper.find('input[aria-label="Rechercher ou créer une étiquette"]').exists()

describe('TagSelector', () => {
  it('opens on the trigger and says so', async () => {
    const wrapper = await mountOpen()

    expect(isOpen(wrapper)).toBe(true)
    expect(
      wrapper
        .get('button[aria-label="Ajouter une étiquette"]')
        .attributes('aria-expanded')
    ).toBe('true')
  })

  it('closes on Escape and gives the focus back to the trigger', async () => {
    const wrapper = await mountOpen()

    await wrapper.get('input').trigger('keydown', { key: 'Escape' })

    expect(isOpen(wrapper)).toBe(false)
    expect(document.activeElement).toBe(
      wrapper.get('button[aria-label="Ajouter une étiquette"]').element
    )
  })

  it('closes when the focus tabs out of it', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const wrapper = await mountOpen()

    await wrapper.get('input').trigger('focusout', { relatedTarget: outside })

    expect(isOpen(wrapper)).toBe(false)
    outside.remove()
  })

  it('stays open while the focus moves inside it', async () => {
    const wrapper = await mountOpen()
    const option = wrapper
      .findAll('button')
      .find(b => b.text().includes('Vacances'))

    await wrapper
      .get('input')
      .trigger('focusout', { relatedTarget: option?.element })

    expect(isOpen(wrapper)).toBe(true)
  })
})
