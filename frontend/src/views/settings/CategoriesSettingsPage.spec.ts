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
    getCategoryAssociations: vi.fn(),
    createCategoryAssociation: vi.fn(),
    deleteCategoryAssociation: vi.fn(),
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
const hiddenExpenseNames = new Set<string>()
vi.mock('@/stores/filters', () => ({
  useFiltersStore: () => ({
    isExpenseCategoryGloballyHidden: (name: string) =>
      hiddenExpenseNames.has(name),
    isIncomeCategoryGloballyHidden: () => false,
    toggleGlobalHiddenExpenseCategory,
    toggleGlobalHiddenIncomeCategory: vi.fn(),
    saveToBackend,
  }),
}))

import { api } from '@/lib/api'

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
  vi.mocked(api.getCategories).mockResolvedValue(
    options?.categories ?? [foodCategory, salaryCategory]
  )
  vi.mocked(api.getSubcategories).mockResolvedValue(
    options?.subcategories ?? [groceriesSub]
  )
  vi.mocked(api.getCategoryAssociations).mockResolvedValue([])

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
  await rows[index].find('button[aria-expanded]').trigger('click')
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  hiddenExpenseNames.clear()
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
    await switches[0].trigger('click')
    await flushPromises()

    expect(toggleGlobalHiddenExpenseCategory).toHaveBeenCalledWith(
      'Alimentation'
    )
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
    await switches[1].trigger('click')
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
    expect(rows[0].text()).toContain('Salaire')
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

    const row = wrapper.findAll('[data-testid="category-row"]')[0]
    await row.find('input[type="text"]').setValue('Restaurant')
    await row.find('form').trigger('submit')
    await flushPromises()

    expect(api.createSubcategory).toHaveBeenCalledWith({
      categoryId: 'cat-food',
      name: 'Restaurant',
    })
    expect(wrapper.text()).toContain('Restaurant')
  })

  it('creates a reimbursement association from an expense row', async () => {
    const wrapper = await mountPage()
    vi.mocked(api.createCategoryAssociation).mockResolvedValue({
      id: 'assoc-1',
      expenseCategoryId: 'cat-food',
      expenseCategoryName: 'Alimentation',
      incomeCategoryId: 'cat-salary',
      incomeCategoryName: 'Salaire',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })

    await expandRow(wrapper, 0)
    const row = wrapper.findAll('[data-testid="category-row"]')[0]
    await row.find('select').setValue('cat-salary')
    await row.findAll('form')[1].trigger('submit')
    await flushPromises()

    expect(api.createCategoryAssociation).toHaveBeenCalledWith({
      expenseCategoryId: 'cat-food',
      incomeCategoryId: 'cat-salary',
    })
    expect(wrapper.text()).toContain('Associée à')
  })

  it('offers no association form on an income category', async () => {
    const wrapper = await mountPage()

    await expandRow(wrapper, 1)

    const row = wrapper.findAll('[data-testid="category-row"]')[1]
    expect(row.find('select').exists()).toBe(false)
    expect(row.text()).toContain(
      'Une association se crée depuis la catégorie de dépense'
    )
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
})
