import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TagSelector from './TagSelector.vue'
import type { TagDto } from '@/lib/api'

const tags: TagDto[] = [
  { id: 't-1', name: 'Vacances', color: '#f00', icon: null },
  { id: 't-2', name: 'Noël', color: '#0f0', icon: null },
] as TagDto[]

describe('TagSelector', () => {
  it('opens from its trigger, says so, and toggles a tag', async () => {
    const wrapper = mount(TagSelector, {
      props: { selectedTagIds: ['t-1'], tags },
      attachTo: document.body,
    })
    const trigger = wrapper.get('button[aria-label="Ajouter une étiquette"]')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(trigger.text()).toContain('Étiquette')

    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    const options = wrapper.findAll('li button')
    expect(options.map(o => o.attributes('aria-pressed'))).toEqual([
      'true',
      'false',
    ])
    await options.map(o => o)[1]?.trigger('click')
    expect(wrapper.emitted('attach')).toEqual([['t-2']])
    wrapper.unmount()
  })

  it('draws the icon-only trigger for a table cell, with the caller’s classes', () => {
    const wrapper = mount(TagSelector, {
      props: {
        selectedTagIds: [],
        tags,
        iconOnly: true,
        triggerClass: 'opacity-0 group-hover:opacity-100',
      },
    })
    const trigger = wrapper.get('button[aria-label="Ajouter une étiquette"]')
    expect(trigger.text()).toBe('')
    expect(trigger.find('svg').exists()).toBe(true)
    expect(trigger.attributes('title')).toBe('Ajouter une étiquette')
    expect(trigger.classes()).toContain('h-8')
    expect(trigger.classes()).toContain('group-hover:opacity-100')
  })

  it('can have no trigger at all and open on request, handing the keyboard back to the opener', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    const wrapper = mount(TagSelector, {
      props: { selectedTagIds: [], tags, hideTrigger: true },
      attachTo: document.body,
    })
    expect(
      wrapper.find('button[aria-label="Ajouter une étiquette"]').exists()
    ).toBe(false)
    expect(wrapper.find('input').exists()).toBe(false)

    wrapper.vm.open(opener)
    await nextTick()
    await nextTick()
    const search = wrapper.get('input')
    expect(document.activeElement).toBe(search.element)

    await search.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('input').exists()).toBe(false)
    expect(document.activeElement).toBe(opener)
    wrapper.unmount()
    opener.remove()
  })
})
