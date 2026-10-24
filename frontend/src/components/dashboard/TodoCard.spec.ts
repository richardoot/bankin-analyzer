import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import TodoCard from './TodoCard.vue'
import type { TodoItem } from '@/lib/todo'

enableAutoUnmount(afterEach)

function todo(key: string, text: string, to: string): TodoItem {
  return { key, text, to, testId: `todo-item-${key}` }
}

const SIX: TodoItem[] = [
  todo('to-file', '12 lignes à classer', '/transactions?categoryId=none'),
  todo(
    'migration',
    '340 € dans des catégories à migrer',
    '/settings/categories/migration'
  ),
  todo(
    'receivables',
    '8 516 € avancés, en attente de remboursement',
    '/reimbursements'
  ),
  todo(
    'envelope-f1',
    'Voyages : enveloppe dépassée de 251 €',
    '/tags/families/f1'
  ),
  todo(
    'subscription-up-a',
    'Nouvel abonnement : Netflix, 13,49 € par mois',
    '/recurrences'
  ),
  todo('price-up-b', 'Free : 29,99 € par mois, contre 24,99 €', '/recurrences'),
]

async function mountCard(items: TodoItem[]) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/dashboard')
  const wrapper = mount(TodoCard, {
    props: { items },
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

const text = (s: string) => s.replace(/\s+/g, ' ').trim()

describe('TodoCard', () => {
  it('renders nothing when there is nothing to do', async () => {
    const wrapper = await mountCard([])
    expect(wrapper.find('[data-testid="todo-card"]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('À faire')
  })

  it('titles the card « À faire » in amber', async () => {
    const wrapper = await mountCard(SIX.slice(0, 1))
    const title = wrapper.get('h2')
    expect(title.text()).toBe('À faire')
    expect(title.classes()).toContain('text-amber-700')
    expect(
      wrapper.get('[data-testid="todo-card"]').attributes('aria-labelledby')
    ).toBe(title.attributes('id'))
  })

  it('renders one link per line, its text on the left and « Voir » on the right', async () => {
    const wrapper = await mountCard(SIX.slice(0, 3))
    const rows = wrapper.findAll('li a')
    expect(rows.map(r => r.attributes('data-testid'))).toEqual([
      'todo-item-to-file',
      'todo-item-migration',
      'todo-item-receivables',
    ])
    const receivables = wrapper.get('[data-testid="todo-item-receivables"]')
    expect(receivables.attributes('href')).toBe('/reimbursements')
    expect(text(receivables.text())).toBe(
      '8 516 € avancés, en attente de remboursement Voir'
    )
    // The whole line is the target: at least 44px high.
    expect(receivables.classes()).toContain('min-h-11')
    expect(wrapper.find('[data-testid="todo-more"]').exists()).toBe(false)
  })

  it('shows four lines, then unfolds the rest in place', async () => {
    const wrapper = await mountCard(SIX)
    expect(wrapper.findAll('li')).toHaveLength(4)
    expect(
      wrapper.find('[data-testid="todo-item-subscription-up-a"]').exists()
    ).toBe(false)

    const more = wrapper.get('[data-testid="todo-more"]')
    expect(more.text()).toBe('et 2 autres')
    expect(more.attributes('aria-expanded')).toBe('false')
    expect(more.attributes('aria-controls')).toBe(
      wrapper.get('ul').attributes('id')
    )

    await more.trigger('click')
    expect(wrapper.findAll('li')).toHaveLength(6)
    expect(
      wrapper.get('[data-testid="todo-item-price-up-b"]').attributes('href')
    ).toBe('/recurrences')
    expect(more.attributes('aria-expanded')).toBe('true')
    expect(more.text()).toBe('Replier')

    await more.trigger('click')
    expect(wrapper.findAll('li')).toHaveLength(4)
  })

  it('says one other in the singular', async () => {
    const wrapper = await mountCard(SIX.slice(0, 5))
    expect(wrapper.get('[data-testid="todo-more"]').text()).toBe('et 1 autre')
  })
})
