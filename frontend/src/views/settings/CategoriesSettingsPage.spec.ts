import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CategoriesSettingsPage from './CategoriesSettingsPage.vue'
import type { CategoryDto, SubcategoryDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getCategories: vi.fn(),
    getSubcategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    createSubcategory: vi.fn(),
    generateCategoryIcons: vi.fn(),
    getCategoryDeletionSummary: vi.fn(),
    deleteCategory: vi.fn(),
  },
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}))

// The visibility switch writes through the filters store; the store itself is
// covered elsewhere, here we only care that the page saves on every toggle.
const saveToBackend = vi.fn().mockResolvedValue(true)
const toggleGlobalHiddenExpenseCategory = vi.fn()
const forgetCategory = vi.fn()
const hiddenExpenseIds = new Set<string>()
vi.mock('@/stores/filters', () => ({
  useFiltersStore: () => ({
    isExpenseCategoryGloballyHidden: (id: string) => hiddenExpenseIds.has(id),
    isIncomeCategoryGloballyHidden: () => false,
    toggleGlobalHiddenExpenseCategory,
    toggleGlobalHiddenIncomeCategory: vi.fn(),
    forgetCategory,
    saveToBackend,
  }),
}))

import { api } from '@/lib/api'
import { nth } from '@/test/nth'

enableAutoUnmount(afterEach)

const foodCategory: CategoryDto = {
  id: 'cat-food',
  name: 'Alimentation',
  type: 'EXPENSE',
  icon: '🍽️',
  isExcludedFromBudget: false,
  createdAt: '2026-01-01T00:00:00Z',
}

const salaryCategory: CategoryDto = {
  id: 'cat-salary',
  name: 'Salaire',
  type: 'INCOME',
  icon: null,
  isExcludedFromBudget: false,
  createdAt: '2026-01-01T00:00:00Z',
}

const groceriesSub: SubcategoryDto = {
  id: 'sub-1',
  categoryId: 'cat-food',
  name: 'Courses',
  icon: '🛒',
  createdAt: '2026-01-01T00:00:00Z',
}

async function mountPage(options?: {
  categories?: CategoryDto[]
  subcategories?: SubcategoryDto[]
}) {
  // Cloned: the page writes the server's answer back into the row it was
  // given, so a shared fixture would carry a rename over to the next test.
  vi.mocked(api.getCategories).mockResolvedValue(
    (options?.categories ?? [foodCategory, salaryCategory]).map(c => ({ ...c }))
  )
  vi.mocked(api.getSubcategories).mockResolvedValue(
    options?.subcategories ?? [groceriesSub]
  )

  const wrapper = mount(CategoriesSettingsPage, {
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return wrapper
}

/** Opens the detail panel of the nth category row. */
async function expandRow(
  wrapper: Awaited<ReturnType<typeof mountPage>>,
  index: number
) {
  const rows = wrapper.findAll('[data-testid="category-row"]')
  await nth(rows, index, 'category row')
    .find('button[aria-expanded]')
    .trigger('click')
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  hiddenExpenseIds.clear()
  saveToBackend.mockResolvedValue(true)
})

describe('CategoriesSettingsPage', () => {
  it('groups categories by type', async () => {
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('Catégories de dépenses')
    expect(wrapper.text()).toContain('Catégories de revenus')
    expect(wrapper.findAll('[data-testid="category-row"]')).toHaveLength(2)
  })

  it('saves the dashboard visibility immediately, with no global save button', async () => {
    const wrapper = await mountPage()

    const switches = wrapper.findAll('button[role="switch"]')
    await nth(switches, 0).trigger('click')
    await flushPromises()

    expect(toggleGlobalHiddenExpenseCategory).toHaveBeenCalledWith('cat-food')
    expect(saveToBackend).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).not.toContain('Enregistrer')
  })

  it('excludes a category from the budget through the second switch', async () => {
    const wrapper = await mountPage()
    vi.mocked(api.updateCategory).mockResolvedValue({
      ...foodCategory,
      isExcludedFromBudget: true,
    })

    const switches = wrapper.findAll('button[role="switch"]')
    await nth(switches, 1).trigger('click')
    await flushPromises()

    expect(api.updateCategory).toHaveBeenCalledWith('cat-food', {
      isExcludedFromBudget: true,
    })
  })

  it('filters the list by search term', async () => {
    const wrapper = await mountPage()

    await wrapper.find('input[type="text"]').setValue('salaire')

    const rows = wrapper.findAll('[data-testid="category-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text()).toContain('Salaire')
  })

  it('lists the subcategories of an expanded category and adds one', async () => {
    const wrapper = await mountPage()
    vi.mocked(api.createSubcategory).mockResolvedValue({
      id: 'sub-2',
      categoryId: 'cat-food',
      name: 'Restaurant',
      icon: null,
      createdAt: '2026-01-01T00:00:00Z',
    })

    await expandRow(wrapper, 0)
    expect(wrapper.text()).toContain('Courses')

    // The panel opens with the rename form, so the subcategory one comes second.
    const row = nth(wrapper.findAll('[data-testid="category-row"]'), 0)
    await nth(row.findAll('input[type="text"]'), 1).setValue('Restaurant')
    await nth(row.findAll('form'), 1).trigger('submit')
    await flushPromises()

    expect(api.createSubcategory).toHaveBeenCalledWith({
      categoryId: 'cat-food',
      name: 'Restaurant',
    })
    expect(wrapper.text()).toContain('Restaurant')
  })

  it('renames a category', async () => {
    const wrapper = await mountPage()
    vi.mocked(api.updateCategory).mockResolvedValue({
      ...foodCategory,
      name: 'Courses',
    })

    await expandRow(wrapper, 0)
    const row = nth(wrapper.findAll('[data-testid="category-row"]'), 0)
    await row.find('[data-testid="rename-input"]').setValue('Courses')
    await nth(row.findAll('form'), 0).trigger('submit')
    await flushPromises()

    expect(api.updateCategory).toHaveBeenCalledWith('cat-food', {
      name: 'Courses',
    })
    // Nothing to replay: the hidden lists key off the id, which never moved.
    expect(wrapper.text()).toContain('Courses')
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('shows the server message when the new name is already taken', async () => {
    const wrapper = await mountPage()
    vi.mocked(api.updateCategory).mockRejectedValue(
      new Error('A category named "Salaire" already exists for this type.')
    )

    await expandRow(wrapper, 0)
    const row = nth(wrapper.findAll('[data-testid="category-row"]'), 0)
    await row.find('[data-testid="rename-input"]').setValue('Salaire')
    await nth(row.findAll('form'), 0).trigger('submit')
    await flushPromises()

    expect(row.find('[data-testid="rename-error"]').text()).toContain(
      'already exists'
    )
    // The row keeps its old name until the rename actually goes through.
    expect(row.text()).toContain('Alimentation')
  })

  it('creates a category from the modal', async () => {
    const wrapper = await mountPage()
    vi.mocked(api.createCategory).mockResolvedValue({
      id: 'cat-new',
      name: 'Loisirs',
      type: 'EXPENSE',
      icon: null,
      isExcludedFromBudget: false,
      createdAt: '2026-01-01T00:00:00Z',
    })

    await wrapper.find('[data-testid="open-create-category"]').trigger('click')
    await wrapper.find('#new-category-name').setValue('Loisirs')
    // The modal form is the last one on the page.
    await wrapper.findAll('form').at(-1)?.trigger('submit')
    await flushPromises()

    expect(api.createCategory).toHaveBeenCalledWith({
      name: 'Loisirs',
      type: 'EXPENSE',
    })
    expect(wrapper.text()).toContain('Loisirs')
  })

  it('counts the categories missing an icon on the generate button', async () => {
    const wrapper = await mountPage()

    const button = wrapper.find('[data-testid="generate-icons"]')
    // Only "Salaire" has no icon.
    expect(button.text()).toContain('(1)')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('disables icon generation when every category already has one', async () => {
    const wrapper = await mountPage({
      categories: [foodCategory],
      subcategories: [],
    })

    expect(
      wrapper.find('[data-testid="generate-icons"]').attributes('disabled')
    ).toBeDefined()
  })

  it('deletes a category through the confirmation modal', async () => {
    const wrapper = await mountPage()
    vi.mocked(api.getCategoryDeletionSummary).mockResolvedValue({
      categoryId: 'cat-food',
      categoryName: 'Alimentation',
      type: 'EXPENSE',
      transactionCount: 0,
      firstTransactionDate: null,
      lastTransactionDate: null,
      subcategoryNames: [],
      labelledTransactionCount: 0,
      budgetPlanEntries: [],
      reimbursementCount: 0,
      isGloballyHidden: false,
      isExcludedFromBudget: false,
    })
    vi.mocked(api.deleteCategory).mockResolvedValue({
      uncategorizedTransactions: 0,
      deletedSubcategories: 0,
      deletedBudgetPlanEntries: 0,
    })

    await expandRow(wrapper, 0)
    await wrapper
      .get('[data-testid="delete-category-cat-food"]')
      .trigger('click')
    await flushPromises()

    await wrapper
      .get('[data-testid="delete-category-confirm"]')
      .trigger('click')
    await flushPromises()

    expect(api.deleteCategory).toHaveBeenCalledWith('cat-food')
    // The row is gone and the store no longer carries the dangling id.
    expect(wrapper.text()).not.toContain('Alimentation')
    expect(forgetCategory).toHaveBeenCalledWith('cat-food', 'EXPENSE')
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('keeps the row when the deletion fails', async () => {
    const wrapper = await mountPage()
    vi.mocked(api.getCategoryDeletionSummary).mockResolvedValue({
      categoryId: 'cat-food',
      categoryName: 'Alimentation',
      type: 'EXPENSE',
      transactionCount: 0,
      firstTransactionDate: null,
      lastTransactionDate: null,
      subcategoryNames: [],
      labelledTransactionCount: 0,
      budgetPlanEntries: [],
      reimbursementCount: 0,
      isGloballyHidden: false,
      isExcludedFromBudget: false,
    })
    vi.mocked(api.deleteCategory).mockRejectedValue(new Error('Boom'))

    await expandRow(wrapper, 0)
    await wrapper
      .get('[data-testid="delete-category-cat-food"]')
      .trigger('click')
    await flushPromises()
    await wrapper
      .get('[data-testid="delete-category-confirm"]')
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Alimentation')
    expect(forgetCategory).not.toHaveBeenCalled()
  })
})
