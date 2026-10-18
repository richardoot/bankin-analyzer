import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import TransactionsLink from './TransactionsLink.vue'
import { transactionsLink } from '@/lib/transactionsLink'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/transactions', component: { template: '<div />' } },
  ],
})

const mountLink = (props: Record<string, unknown>, slot?: string) =>
  mount(TransactionsLink, {
    props: { to: transactionsLink({ categoryId: 'cat-1' }), ...props },
    slots: slot ? { default: slot } : {},
    global: { plugins: [router] },
  })

describe('TransactionsLink', () => {
  it('is a link to the Transactions page named by what it opens', () => {
    const wrapper = mountLink({ subject: 'Alimentation' })

    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('/transactions?category=cat-1')
    expect(link.attributes('aria-label')).toBe(
      'Voir les transactions de Alimentation'
    )
    expect(link.text()).toBe('Voir les transactions de Alimentation')
  })

  it('reads « Voir les transactions » when nothing names the subject', () => {
    const wrapper = mountLink({})

    expect(wrapper.get('a').attributes('aria-label')).toBe(
      'Voir les transactions'
    )
    expect(wrapper.text()).toBe('Voir les transactions')
  })

  it('lets the caller word the visible text', () => {
    const wrapper = mountLink({ subject: 'Julien' }, 'Voir les 3 transactions')

    expect(wrapper.text()).toBe('Voir les 3 transactions')
    expect(wrapper.get('a').attributes('aria-label')).toBe(
      'Voir les transactions de Julien'
    )
  })

  it('opens a new tab when asked, keeping the name', () => {
    const wrapper = mountLink({ subject: 'Loisirs', newTab: true })

    const link = wrapper.get('a')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(link.attributes('href')).toBe('/transactions?category=cat-1')
    expect(link.attributes('aria-label')).toBe(
      'Voir les transactions de Loisirs'
    )
  })

  it('keeps the name off screen when drawn as an arrow alone', () => {
    const wrapper = mountLink({ subject: 'Loisirs', iconOnly: true })

    expect(wrapper.get('a').attributes('title')).toBe(
      'Voir les transactions de Loisirs'
    )
    expect(wrapper.find('span.sr-only').text()).toBe(
      'Voir les transactions de Loisirs'
    )
  })

  it('does not hand its click to the row it sits in', async () => {
    const onRowClick = vi.fn()
    const wrapper = mount(
      {
        components: { TransactionsLink },
        props: ['to'],
        template:
          '<div @click="$emit(\'row\')"><TransactionsLink :to="to" subject="X" /></div>',
        emits: ['row'],
      },
      {
        props: { to: transactionsLink({ tagId: 't' }) },
        global: { plugins: [router] },
        attrs: { onRow: onRowClick },
      }
    )

    await wrapper.get('a').trigger('click')

    expect(onRowClick).not.toHaveBeenCalled()
  })
})
