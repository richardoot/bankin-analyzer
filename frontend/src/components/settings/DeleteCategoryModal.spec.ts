import { describe, it, expect, vi, beforeEach } from 'vitest'
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

const mockedApi = vi.mocked(api)

const category: CategoryDto = {
  id: 'cat-food',
  name: 'Alimentation',
  type: 'EXPENSE',
  icon: '🍽️',
  isExcludedFromBudget: false,
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
  associatedCategoryName: null,
  isGloballyHidden: false,
  isExcludedFromBudget: false,
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
  associatedCategoryName: 'Remboursement courses',
  isGloballyHidden: true,
  isExcludedFromBudget: false,
}

enableAutoUnmount(() => {})

async function mountModal(summary: CategoryDeletionSummaryDto = fullSummary) {
  mockedApi.getCategoryDeletionSummary.mockResolvedValue(summary)
  const wrapper = mount(DeleteCategoryModal, {
    props: { category },
    // Stubbed so the dialog renders inside the wrapper rather than in <body>.
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return wrapper
}

const confirmButton = (wrapper: Awaited<ReturnType<typeof mountModal>>) =>
  wrapper.get('[data-testid="delete-category-confirm"]')

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
    const wrapper = await mountModal()

    const kept = wrapper.get('[data-testid="deletion-kept"]').text()
    expect(kept).toContain('340')
    expect(kept).toContain('sans catégorie')
    // The date range tells the user which period loses its filing.
    expect(kept).toContain('janvier 2024')
    expect(kept).toContain('novembre 2024')
    // The denormalized label purge is stated, not silent.
    expect(kept).toContain('312')
    expect(kept).toContain('3')

    const destroyed = wrapper.get('[data-testid="deletion-destroyed"]').text()
    expect(destroyed).toContain('Courses, Restaurant')
    expect(destroyed).toContain('Budget 2024')
    expect(destroyed).toContain('450')
    expect(destroyed).toContain('Remboursement courses')
  })

  it('recalls the settings currently applied to the category', async () => {
    const wrapper = await mountModal()

    expect(wrapper.get('[data-testid="deletion-settings"]').text()).toContain(
      'masquée du dashboard'
    )
  })

  it('keeps the confirm button locked until the name is typed back', async () => {
    const wrapper = await mountModal()

    expect(confirmButton(wrapper).attributes('disabled')).toBeDefined()

    await wrapper
      .get('[data-testid="delete-category-confirmation"]')
      .setValue('Alimentation')

    expect(confirmButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('accepts the typed name regardless of case and spacing', async () => {
    const wrapper = await mountModal()

    await wrapper
      .get('[data-testid="delete-category-confirmation"]')
      .setValue('  alimentation ')

    expect(confirmButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('asks for no confirmation when nothing is attached', async () => {
    const wrapper = await mountModal(emptySummary)

    expect(
      wrapper.find('[data-testid="delete-category-confirmation"]').exists()
    ).toBe(false)
    expect(wrapper.get('[data-testid="deletion-empty"]').text()).toContain(
      'Rien'
    )
    expect(confirmButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('emits the outcome once the deletion went through', async () => {
    const wrapper = await mountModal(emptySummary)

    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockedApi.deleteCategory).toHaveBeenCalledWith('cat-food')
    expect(wrapper.emitted('deleted')?.[0]).toEqual([
      { category, uncategorizedTransactions: 340 },
    ])
  })

  it('surfaces a failed deletion and stays open', async () => {
    mockedApi.deleteCategory.mockRejectedValue(new Error('Boom'))
    const wrapper = await mountModal(emptySummary)

    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="deletion-error"]').text()).toContain(
      'Boom'
    )
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })

  it('surfaces a failed impact lookup without offering to delete', async () => {
    mockedApi.getCategoryDeletionSummary.mockRejectedValue(
      new Error('Réseau indisponible')
    )
    const wrapper = mount(DeleteCategoryModal, {
      props: { category },
      global: { stubs: { Teleport: true } },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="deletion-error"]').text()).toContain(
      'Réseau indisponible'
    )
    expect(confirmButton(wrapper).attributes('disabled')).toBeDefined()
  })
})
