import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import DeleteCategoryModal from './DeleteCategoryModal.vue'
import type { CategoryDeletionSummaryDto, CategoryDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getCategoryDeletionSummary: vi.fn(),
    deleteCategory: vi.fn(),
  },
}))

import { api } from '@/lib/api'

// The links to the Transactions page need a router behind RouterLink.
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/transactions', component: { template: '<div />' } },
  ],
})

const mockedApi = vi.mocked(api)

const category: CategoryDto = {
  id: 'cat-food',
  name: 'Alimentation',
  type: 'EXPENSE',
  icon: '🍽️',
  createdAt: '2024-01-01T00:00:00.000Z',
}

/** Nothing attached — the case that skips the typed-name guard. */
const emptySummary: CategoryDeletionSummaryDto = {
  categoryId: category.id,
  categoryName: category.name,
  type: 'EXPENSE',
  transactionCount: 0,
  firstTransactionDate: null,
  lastTransactionDate: null,
  subcategoryNames: [],
  labelledTransactionCount: 0,
  budgetPlanEntries: [],
  reimbursementCount: 0,
}

const fullSummary: CategoryDeletionSummaryDto = {
  ...emptySummary,
  transactionCount: 340,
  firstTransactionDate: '2024-01-05T00:00:00.000Z',
  lastTransactionDate: '2024-11-28T00:00:00.000Z',
  subcategoryNames: ['Courses', 'Restaurant'],
  labelledTransactionCount: 312,
  budgetPlanEntries: [
    {
      planName: 'Budget 2024',
      amount: 450,
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: '2024-12-31T00:00:00.000Z',
    },
  ],
  reimbursementCount: 3,
}

enableAutoUnmount(afterEach)

afterEach(() => {
  document.body.innerHTML = ''
})

// The dialog teleports to <body> and the typed name lives in a brick of
// its own, so the spec reads the document rather than stubbing the Teleport
// (a stubbed one remounts its subtree on every render and loses the text).
const q = <T extends Element>(selector: string): T => {
  const el = document.body.querySelector<T>(selector)
  if (!el) throw new Error(`no element matches ${selector}`)
  return el
}

const text = (selector: string) => q(selector).textContent ?? ''

async function type(value: string): Promise<void> {
  const input = q<HTMLInputElement>(
    '[data-testid="delete-category-confirmation"]'
  )
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

async function mountModal(summary: CategoryDeletionSummaryDto = fullSummary) {
  mockedApi.getCategoryDeletionSummary.mockResolvedValue(summary)
  const wrapper = mount(DeleteCategoryModal, {
    global: { plugins: [router] },
    props: { category },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

const confirmButton = () =>
  q<HTMLButtonElement>('[data-testid="delete-category-confirm"]')

describe('DeleteCategoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.deleteCategory.mockResolvedValue({
      uncategorizedTransactions: 340,
      deletedSubcategories: 2,
      deletedBudgetPlanEntries: 1,
    })
  })

  it('fetches the impact for the category it is opened on', async () => {
    await mountModal()

    expect(mockedApi.getCategoryDeletionSummary).toHaveBeenCalledWith(
      'cat-food'
    )
  })

  it('separates what is kept from what is destroyed', async () => {
    await mountModal()

    const kept = text('[data-testid="deletion-kept"]')
    expect(kept).toContain('340')
    expect(kept).toContain('sans catégorie')
    // The date range tells the user which period loses its filing.
    expect(kept).toContain('janvier 2024')
    expect(kept).toContain('novembre 2024')
    // The denormalized label purge is stated, not silent.
    expect(kept).toContain('312')
    expect(kept).toContain('3')

    const destroyed = text('[data-testid="deletion-destroyed"]')
    expect(destroyed).toContain('Courses, Restaurant')
    expect(destroyed).toContain('Budget 2024')
    expect(destroyed).toContain('450')
  })

  it('keeps the confirm button locked until the name is typed back', async () => {
    await mountModal()

    expect(confirmButton().disabled).toBe(true)

    await type('Alimentation')

    expect(confirmButton().disabled).toBe(false)
  })

  it('accepts the typed name regardless of case and spacing', async () => {
    await mountModal()

    await type('  alimentation ')

    expect(confirmButton().disabled).toBe(false)
  })

  it('asks for no confirmation when nothing is attached', async () => {
    await mountModal(emptySummary)

    expect(
      document.body.querySelector(
        '[data-testid="delete-category-confirmation"]'
      )
    ).toBeNull()
    expect(text('[data-testid="deletion-empty"]')).toContain('Rien')
    expect(confirmButton().disabled).toBe(false)
  })

  it('emits the outcome once the deletion went through', async () => {
    const wrapper = await mountModal(emptySummary)

    confirmButton().click()
    await flushPromises()

    expect(mockedApi.deleteCategory).toHaveBeenCalledWith('cat-food')
    expect(wrapper.emitted('deleted')?.[0]).toEqual([
      { category, uncategorizedTransactions: 340 },
    ])
  })

  it('surfaces a failed deletion and stays open', async () => {
    mockedApi.deleteCategory.mockRejectedValue(new Error('Boom'))
    const wrapper = await mountModal(emptySummary)

    confirmButton().click()
    await flushPromises()

    expect(text('[data-testid="deletion-error"]')).toContain('Boom')
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })

  it('surfaces a failed impact lookup without offering to delete', async () => {
    mockedApi.getCategoryDeletionSummary.mockRejectedValue(
      new Error('Réseau indisponible')
    )
    mount(DeleteCategoryModal, {
      global: { plugins: [router] },
      props: { category },
      attachTo: document.body,
    })
    await flushPromises()

    expect(text('[data-testid="deletion-error"]')).toContain(
      'Réseau indisponible'
    )
    expect(confirmButton().disabled).toBe(true)
  })

  it('offers the rows it would unfile, and closes on the way there', async () => {
    const wrapper = await mountModal()

    const link = q<HTMLAnchorElement>(
      '[data-testid="deletion-transactions-link"]'
    )
    expect(link.getAttribute('href')).toBe(
      `/transactions?category=${category.id}&label=${encodeURIComponent(category.name).replace(/%20/g, '+')}`
    )
    link.click()
    await flushPromises()

    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
