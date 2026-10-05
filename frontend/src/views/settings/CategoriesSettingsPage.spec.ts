import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CategoriesSettingsPage from './CategoriesSettingsPage.vue'
import type { CategoryDto, SubcategoryDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getCategories: vi.fn(),
    getSubcategories: vi.fn(),
    updateCategory: vi.fn(),
    createSubcategory: vi.fn(),
    deleteSubcategory: vi.fn(),
    generateCategoryIcons: vi.fn(),
    getCategoryDeletionSummary: vi.fn(),
    deleteCategory: vi.fn(),
    getLegacyCategories: vi.fn(),
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

/** A catalogue expense category, locked, with the defaults of its "Autre". */
const foodCategory: CategoryDto = {
  id: 'cat-food',
  name: 'Alimentation',
  type: 'EXPENSE',
  icon: '🍽️',
  catalogKey: 'food',
  isLocked: true,
  defaultNature: 'ESSENTIAL',
  defaultRhythm: 'VARIABLE',
  createdAt: '2026-01-01T00:00:00Z',
}

const salaryCategory: CategoryDto = {
  id: 'cat-salary',
  name: "Revenus d'activité",
  type: 'INCOME',
  icon: null,
  catalogKey: 'work-income',
  isLocked: true,
  defaultNature: null,
  defaultRhythm: null,
  createdAt: '2026-01-01T00:00:00Z',
}

const savingsCategory: CategoryDto = {
  id: 'cat-savings',
  name: 'Épargne de précaution',
  type: 'TRANSFER' as 'EXPENSE',
  icon: '🛟',
  catalogKey: 'emergency-savings',
  isLocked: true,
  defaultNature: null,
  defaultRhythm: null,
  createdAt: '2026-01-01T00:00:00Z',
}

/** From before the catalogue: no key, still renamable and deletable. */
const legacyCategory: CategoryDto = {
  id: 'cat-abos',
  name: 'Abonnements',
  type: 'EXPENSE',
  icon: '📱',
  catalogKey: null,
  isLocked: false,
  defaultNature: null,
  defaultRhythm: null,
  createdAt: '2026-01-01T00:00:00Z',
}

const groceriesSub: SubcategoryDto = {
  id: 'sub-1',
  categoryId: 'cat-food',
  name: 'Supermarché',
  icon: '🛒',
  catalogKey: 'food.supermarket',
  isLocked: true,
  nature: 'ESSENTIAL',
  rhythm: 'VARIABLE',
  createdAt: '2026-01-01T00:00:00Z',
}

const customSub: SubcategoryDto = {
  id: 'sub-custom',
  categoryId: 'cat-food',
  name: 'Traiteur',
  icon: null,
  catalogKey: null,
  isLocked: false,
  nature: 'PLEASURE',
  rhythm: 'VARIABLE',
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
    global: {
      stubs: {
        Teleport: true,
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
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
  it('groups the catalogue by kind, transfers included', async () => {
    const wrapper = await mountPage({
      categories: [foodCategory, salaryCategory, savingsCategory],
    })

    expect(wrapper.text()).toContain('Dépenses')
    expect(wrapper.text()).toContain('Revenus')
    expect(wrapper.text()).toContain('Transferts')
    expect(wrapper.findAll('[data-testid="category-row"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="category-lock"]')).toHaveLength(3)
    expect(
      wrapper.find('[data-testid="legacy-migration-banner"]').exists()
    ).toBe(false)
  })

  it('offers no way to create a category', async () => {
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="open-create-category"]').exists()).toBe(
      false
    )
    expect(wrapper.text()).not.toContain('Nouvelle catégorie')
  })

  it('puts the legacy categories first, with the banner and the assistant link', async () => {
    const wrapper = await mountPage({
      categories: [foodCategory, legacyCategory],
    })

    expect(
      wrapper.find('[data-testid="legacy-migration-banner"]').exists()
    ).toBe(true)
    const sections = wrapper.findAll('[data-testid^="category-section-"]')
    expect(nth(sections, 0).attributes('data-testid')).toBe(
      'category-section-legacy'
    )
    const rows = wrapper.findAll('[data-testid="category-row"]')
    expect(nth(rows, 0).text()).toContain('Abonnements')
    expect(nth(rows, 0).find('[data-testid="category-legacy"]').exists()).toBe(
      true
    )

    await expandRow(wrapper, 0)
    expect(
      nth(rows, 0).find('[data-testid="migrate-category-cat-abos"]').exists()
    ).toBe(true)
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

  it('filters the list by search term, reaching subcategory names', async () => {
    const wrapper = await mountPage()

    await wrapper.find('input[type="text"]').setValue('revenus')
    expect(wrapper.findAll('[data-testid="category-row"]')).toHaveLength(1)

    // "supermarche" is a subcategory of Alimentation, not a category name.
    await wrapper.find('input[type="text"]').setValue('supermarche')
    const rows = wrapper.findAll('[data-testid="category-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text()).toContain('Alimentation')
  })

  it('shows a catalogue row locked: attributes, no rename form', async () => {
    const wrapper = await mountPage()

    await expandRow(wrapper, 0)
    const row = nth(wrapper.findAll('[data-testid="category-row"]'), 0)
    expect(row.find('[data-testid="catalog-note"]').text()).toContain(
      'Essentiel'
    )
    expect(row.find('[data-testid="rename-input"]').exists()).toBe(false)
    expect(row.find('[data-testid="delete-category-cat-food"]').exists()).toBe(
      false
    )
    // The catalogue subcategory carries its attributes and no delete button.
    const chip = row.find('[data-testid="subcategory-chip"]')
    expect(chip.text()).toContain('Supermarché')
    expect(chip.text()).toContain('Variable')
    expect(chip.find('[data-testid^="delete-subcategory-"]').exists()).toBe(
      false
    )
  })

  it("adds a subcategory with the parent's defaults", async () => {
    const wrapper = await mountPage()
    vi.mocked(api.createSubcategory).mockResolvedValue({
      ...customSub,
      id: 'sub-2',
      name: 'Restaurant',
    })

    await expandRow(wrapper, 0)
    const row = nth(wrapper.findAll('[data-testid="category-row"]'), 0)
    await row.find('input[type="text"]').setValue('Restaurant')
    await row.find('form').trigger('submit')
    await flushPromises()

    expect(api.createSubcategory).toHaveBeenCalledWith({
      categoryId: 'cat-food',
      name: 'Restaurant',
      nature: 'ESSENTIAL',
      rhythm: 'VARIABLE',
    })
    expect(wrapper.text()).toContain('Restaurant')
  })

  it('lets the user pick the attributes of a new subcategory', async () => {
    const wrapper = await mountPage()
    vi.mocked(api.createSubcategory).mockResolvedValue({
      ...customSub,
      id: 'sub-2',
      name: 'Cours',
    })

    await expandRow(wrapper, 0)
    const row = nth(wrapper.findAll('[data-testid="category-row"]'), 0)
    const selects = row.findAll('select')
    await nth(selects, 0).setValue('PLEASURE')
    await nth(selects, 1).setValue('COMMITTED')
    await row.find('input[type="text"]').setValue('Cours')
    await row.find('form').trigger('submit')
    await flushPromises()

    expect(api.createSubcategory).toHaveBeenCalledWith({
      categoryId: 'cat-food',
      name: 'Cours',
      nature: 'PLEASURE',
      rhythm: 'COMMITTED',
    })
  })

  it('offers no subcategory under a transfer category', async () => {
    const wrapper = await mountPage({
      categories: [savingsCategory],
      subcategories: [],
    })

    await expandRow(wrapper, 0)
    const row = nth(wrapper.findAll('[data-testid="category-row"]'), 0)
    expect(row.find('form').exists()).toBe(false)
    expect(row.text()).toContain('transfert')
  })

  it('deletes a custom subcategory after confirmation, and says where the rows went', async () => {
    const wrapper = await mountPage({
      subcategories: [groceriesSub, customSub],
    })
    vi.mocked(api.deleteSubcategory).mockResolvedValue({
      refiledTransactions: 3,
      fallbackSubcategoryId: 'sub-other',
      fallbackSubcategoryName: 'Autre',
    })

    await expandRow(wrapper, 0)
    await wrapper
      .get('[data-testid="delete-subcategory-sub-custom"]')
      .trigger('click')
    await flushPromises()

    const confirm = wrapper
      .findAll('button')
      .find(b => b.text() === 'Supprimer')
    expect(confirm).toBeDefined()
    await confirm!.trigger('click')
    await flushPromises()

    expect(api.deleteSubcategory).toHaveBeenCalledWith('sub-custom')
    expect(wrapper.text()).not.toContain('Traiteur')
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('Autre'))
  })

  it('renames a legacy category', async () => {
    const wrapper = await mountPage({ categories: [legacyCategory] })
    vi.mocked(api.updateCategory).mockResolvedValue({
      ...legacyCategory,
      name: 'Abos',
    })

    await expandRow(wrapper, 0)
    const row = nth(wrapper.findAll('[data-testid="category-row"]'), 0)
    await row.find('[data-testid="rename-input"]').setValue('Abos')
    await nth(row.findAll('form'), 0).trigger('submit')
    await flushPromises()

    expect(api.updateCategory).toHaveBeenCalledWith('cat-abos', {
      name: 'Abos',
    })
    expect(wrapper.text()).toContain('Abos')
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('shows the server message when the new name is already taken', async () => {
    const wrapper = await mountPage({ categories: [legacyCategory] })
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
    expect(row.text()).toContain('Abonnements')
  })

  it('counts what is missing an icon on the generate button', async () => {
    const wrapper = await mountPage()

    const button = wrapper.find('[data-testid="generate-icons"]')
    // Only "Revenus d'activité" has no icon.
    expect(button.text()).toContain('(1)')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('disables icon generation when everything already has one', async () => {
    const wrapper = await mountPage({
      categories: [foodCategory],
      subcategories: [groceriesSub],
    })

    expect(
      wrapper.find('[data-testid="generate-icons"]').attributes('disabled')
    ).toBeDefined()
  })

  it('deletes a legacy category through the confirmation modal', async () => {
    const wrapper = await mountPage({ categories: [legacyCategory] })
    vi.mocked(api.getCategoryDeletionSummary).mockResolvedValue({
      categoryId: 'cat-abos',
      categoryName: 'Abonnements',
      type: 'EXPENSE',
      transactionCount: 0,
      firstTransactionDate: null,
      lastTransactionDate: null,
      subcategoryNames: [],
      labelledTransactionCount: 0,
      budgetPlanEntries: [],
      reimbursementCount: 0,
      isGloballyHidden: false,
    })
    vi.mocked(api.deleteCategory).mockResolvedValue({
      uncategorizedTransactions: 0,
      deletedSubcategories: 0,
      deletedBudgetPlanEntries: 0,
    })

    await expandRow(wrapper, 0)
    await wrapper
      .get('[data-testid="delete-category-cat-abos"]')
      .trigger('click')
    await flushPromises()

    await wrapper
      .get('[data-testid="delete-category-confirm"]')
      .trigger('click')
    await flushPromises()

    expect(api.deleteCategory).toHaveBeenCalledWith('cat-abos')
    expect(wrapper.text()).not.toContain('Abonnements')
    expect(forgetCategory).toHaveBeenCalledWith('cat-abos', 'EXPENSE')
    expect(toastSuccess).toHaveBeenCalled()
  })
})
