import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import LegacyMigrationPage from './LegacyMigrationPage.vue'
import type {
  CategoryDto,
  LegacyOverviewDto,
  SubcategoryDto,
  TagDto,
} from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getLegacyCategories: vi.fn(),
    getCategories: vi.fn(),
    getSubcategories: vi.fn(),
    getTags: vi.fn(),
    createTag: vi.fn(),
    previewLegacyMigration: vi.fn(),
    migrateLegacyCategory: vi.fn(),
  },
}))

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}))

import { api } from '@/lib/api'
import { nth } from '@/test/nth'

enableAutoUnmount(afterEach)

const overview: LegacyOverviewDto = {
  totalTransactions: 8,
  categories: [
    {
      id: 'cat-abos',
      name: 'Abonnements',
      type: 'EXPENSE',
      icon: '📱',
      transactionCount: 8,
      isHidden: false,
      budgetPlanEntryCount: 1,
      isCatalog: false,
      catalogKey: null,
      lines: [
        {
          sourceSubcategoryId: 'sub-phone',
          name: 'Téléphonie mobile',
          transactionCount: 5,
          suggestion: {
            action: 'CATALOG',
            categoryKey: 'telecom',
            categoryName: 'Télécom et numérique',
            subcategoryKey: 'telecom.phone',
            subcategoryName: 'Téléphone',
            tagName: null,
            basis: 'subcategory',
          },
        },
        {
          sourceSubcategoryId: 'sub-gifts',
          name: 'Cadeaux',
          transactionCount: 2,
          suggestion: {
            action: 'CATALOG',
            categoryKey: 'shopping',
            categoryName: 'Shopping et soins',
            subcategoryKey: null,
            subcategoryName: null,
            tagName: 'Cadeaux',
            basis: 'category',
          },
        },
        {
          sourceSubcategoryId: null,
          name: null,
          transactionCount: 1,
          suggestion: null,
        },
      ],
    },
  ],
}

const categories: CategoryDto[] = [
  {
    id: 'cat-telecom',
    name: 'Télécom et numérique',
    type: 'EXPENSE',
    icon: '📱',
    catalogKey: 'telecom',
    isLocked: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'cat-shopping',
    name: 'Shopping et soins',
    type: 'EXPENSE',
    icon: '🛍️',
    catalogKey: 'shopping',
    isLocked: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'cat-savings',
    name: 'Épargne de précaution',
    type: 'TRANSFER' as 'EXPENSE',
    icon: '🛟',
    catalogKey: 'emergency-savings',
    isLocked: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'cat-refunds',
    name: 'Remboursements',
    type: 'INCOME',
    icon: null,
    catalogKey: 'refunds',
    isLocked: true,
    createdAt: '2026-01-01',
  },
]

const subcategories: SubcategoryDto[] = [
  {
    id: 'sub-tel-phone',
    categoryId: 'cat-telecom',
    name: 'Téléphone',
    icon: null,
    catalogKey: 'telecom.phone',
    isLocked: true,
    createdAt: '2026-01-01',
  },
]

const proTag: TagDto = {
  id: 'tag-pro',
  name: 'Pro',
  color: null,
  icon: null,
  transactionCount: 0,
  isExceptional: false,
  eventStartDate: null,
  eventEndDate: null,
  budgetAmount: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

async function mountPage(
  tags: TagDto[] = [proTag],
  data: LegacyOverviewDto = overview
) {
  vi.mocked(api.getLegacyCategories).mockResolvedValue(
    JSON.parse(JSON.stringify(data)) as LegacyOverviewDto
  )
  vi.mocked(api.getCategories).mockResolvedValue(categories)
  vi.mocked(api.getSubcategories).mockResolvedValue(subcategories)
  vi.mocked(api.getTags).mockResolvedValue(tags)
  const wrapper = mount(LegacyMigrationPage, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LegacyMigrationPage', () => {
  it('marks a catalogue category that only has subcategories to tidy', async () => {
    const wrapper = await mountPage([proTag], {
      totalTransactions: 22,
      categories: [
        {
          id: 'cat-housing',
          name: 'Logement',
          type: 'EXPENSE',
          icon: '🏠',
          transactionCount: 22,
          isHidden: false,
          budgetPlanEntryCount: 0,
          isCatalog: true,
          catalogKey: 'housing',
          lines: [
            {
              sourceSubcategoryId: 'sub-loyer',
              name: 'Loyer',
              transactionCount: 22,
              suggestion: {
                action: 'CATALOG',
                categoryKey: 'housing',
                categoryName: 'Logement',
                subcategoryKey: 'housing.rent',
                subcategoryName: 'Loyer ou crédit immobilier',
                tagName: null,
                basis: 'subcategory',
              },
            },
          ],
        },
      ],
    })

    const row = wrapper.find('[data-testid="legacy-category-cat-housing"]')
    expect(row.find('[data-testid="tidy-badge"]').text()).toContain(
      'Sous-catégories à ranger'
    )
    expect(row.text()).toContain('1 ligne')
  })

  it('lists the legacy categories with their counts', async () => {
    const wrapper = await mountPage()

    const row = wrapper.find('[data-testid="legacy-category-cat-abos"]')
    expect(row.text()).toContain('Abonnements')
    expect(row.text()).toContain('8 transactions')
    expect(row.text()).toContain('3 lignes')
    expect(row.text()).toContain('2 suggérées')
    expect(row.text()).toContain('1 enveloppe')
  })

  it('opens the decisions pre-filled with the suggestions, targets of the right sign only', async () => {
    const wrapper = await mountPage()

    await wrapper
      .find('[data-testid="legacy-category-cat-abos"]')
      .trigger('click')

    const lines = wrapper.findAll('[data-testid="legacy-line"]')
    expect(lines).toHaveLength(3)
    const choices = wrapper.findAll('[data-testid="line-choice"]')
    expect((nth(choices, 0).element as HTMLSelectElement).value).toBe(
      'CATALOG:telecom:telecom.phone'
    )
    expect((nth(choices, 1).element as HTMLSelectElement).value).toBe(
      'CATALOG:shopping'
    )
    expect((nth(choices, 2).element as HTMLSelectElement).value).toBe('KEEP')
    expect(nth(lines, 2).text()).toContain('Aucune suggestion')

    // Expense and transfer categories are offered; the income one is not.
    const options = nth(choices, 0)
      .findAll('option')
      .map(o => o.text())
    expect(options.some(o => o.includes('Épargne de précaution'))).toBe(true)
    expect(options.some(o => o.includes('Remboursements'))).toBe(false)
  })

  it('offers to create a suggested tag the user does not have, and attaches it', async () => {
    const wrapper = await mountPage()
    vi.mocked(api.createTag).mockResolvedValue({
      ...proTag,
      id: 'tag-gifts',
      name: 'Cadeaux',
    })

    await wrapper
      .find('[data-testid="legacy-category-cat-abos"]')
      .trigger('click')
    await wrapper.find('[data-testid="create-tag-Cadeaux"]').trigger('click')
    await flushPromises()

    expect(api.createTag).toHaveBeenCalledWith({ name: 'Cadeaux' })
    const tagSelects = wrapper.findAll('[data-testid="line-tag"]')
    expect((nth(tagSelects, 1).element as HTMLSelectElement).value).toBe(
      'tag-gifts'
    )
    expect(wrapper.find('[data-testid="create-tag-Cadeaux"]').exists()).toBe(
      false
    )
  })

  it('sends the decisions to the preview, then migrates on confirmation', async () => {
    const wrapper = await mountPage()
    vi.mocked(api.previewLegacyMigration).mockResolvedValue({
      sourceCategoryId: 'cat-abos',
      sourceCategoryName: 'Abonnements',
      moves: [
        {
          sourceSubcategoryId: 'sub-phone',
          sourceSubcategoryName: 'Téléphonie mobile',
          transactionCount: 5,
          categoryName: 'Télécom et numérique',
          subcategoryName: 'Téléphone',
          createsSubcategory: false,
          reparentsSubcategory: false,
          changesType: false,
          tagId: null,
        },
      ],
      unfiles: [],
      keptTransactions: 3,
      movedTransactions: 5,
      unfiledTransactions: 0,
      typeChangedTransactions: 0,
      deletesSourceCategory: false,
      budgetEntries: [
        {
          planName: 'Budget 2026',
          amount: 60,
          targetCategoryName: 'Abonnements',
          mergesIntoExisting: false,
        },
      ],
      dropsHiddenPreference: false,
    })
    vi.mocked(api.migrateLegacyCategory).mockResolvedValue({
      sourceCategoryId: 'cat-abos',
      movedTransactions: 5,
      unfiledTransactions: 0,
      keptTransactions: 3,
      typeChangedTransactions: 0,
      createdSubcategories: 0,
      reparentedSubcategories: 0,
      deletedSubcategories: 1,
      taggedTransactions: 0,
      budgetEntriesMoved: 0,
      budgetEntriesMerged: 0,
      budgetEntriesDropped: 0,
      hiddenPreferenceDropped: false,
      sourceDeleted: false,
    })

    await wrapper
      .find('[data-testid="legacy-category-cat-abos"]')
      .trigger('click')
    // Keep the gifts line and the loose rows; move the phone line.
    const choices = wrapper.findAll('[data-testid="line-choice"]')
    await nth(choices, 1).setValue('KEEP')
    await wrapper.find('[data-testid="to-preview"]').trigger('click')
    await flushPromises()

    expect(api.previewLegacyMigration).toHaveBeenCalledWith('cat-abos', [
      {
        sourceSubcategoryId: 'sub-phone',
        action: 'CATALOG',
        categoryKey: 'telecom',
        subcategoryKey: 'telecom.phone',
        tagId: null,
      },
      { sourceSubcategoryId: 'sub-gifts', action: 'KEEP', tagId: null },
      { sourceSubcategoryId: null, action: 'KEEP', tagId: null },
    ])
    expect(wrapper.find('[data-testid="preview-summary"]').text()).toContain(
      '5'
    )
    expect(wrapper.find('[data-testid="preview-lines"]').text()).toContain(
      'Télécom et numérique › Téléphone'
    )
    expect(wrapper.find('[data-testid="preview-effects"]').text()).toContain(
      'conservée'
    )

    await wrapper.find('[data-testid="apply-migration"]').trigger('click')
    await flushPromises()

    expect(api.migrateLegacyCategory).toHaveBeenCalledWith(
      'cat-abos',
      expect.any(Array)
    )
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining('en partie')
    )
    // Back to the list, reloaded.
    expect(api.getLegacyCategories).toHaveBeenCalledTimes(2)
  })

  it('shows the server reason when the arrangement is impossible', async () => {
    const wrapper = await mountPage()
    vi.mocked(api.previewLegacyMigration).mockRejectedValue(
      new Error(
        '"Téléphonie mobile" holds EXPENSE rows and cannot go to "Remboursements"'
      )
    )

    await wrapper
      .find('[data-testid="legacy-category-cat-abos"]')
      .trigger('click')
    await wrapper.find('[data-testid="to-preview"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="preview-error"]').text()).toContain(
      'cannot go to'
    )
    expect(api.migrateLegacyCategory).not.toHaveBeenCalled()
  })

  it('requires a name for a custom subcategory before previewing', async () => {
    const wrapper = await mountPage()

    await wrapper
      .find('[data-testid="legacy-category-cat-abos"]')
      .trigger('click')
    await nth(wrapper.findAll('[data-testid="line-choice"]'), 0).setValue(
      'CUSTOM:telecom'
    )

    expect(wrapper.find('[data-testid="line-custom-name"]').exists()).toBe(true)
    expect(
      wrapper.find('[data-testid="to-preview"]').attributes('disabled')
    ).toBeDefined()

    await wrapper.find('[data-testid="line-custom-name"]').setValue('Forfaits')
    expect(
      wrapper.find('[data-testid="to-preview"]').attributes('disabled')
    ).toBeUndefined()
  })

  it('goes back to the categories once nothing legacy remains', async () => {
    const wrapper = await mountPage()
    vi.mocked(api.previewLegacyMigration).mockResolvedValue({
      sourceCategoryId: 'cat-abos',
      sourceCategoryName: 'Abonnements',
      moves: [],
      unfiles: [],
      keptTransactions: 0,
      movedTransactions: 8,
      unfiledTransactions: 0,
      typeChangedTransactions: 0,
      deletesSourceCategory: true,
      budgetEntries: [],
      dropsHiddenPreference: false,
    })
    vi.mocked(api.migrateLegacyCategory).mockResolvedValue({
      sourceCategoryId: 'cat-abos',
      movedTransactions: 8,
      unfiledTransactions: 0,
      keptTransactions: 0,
      typeChangedTransactions: 0,
      createdSubcategories: 0,
      reparentedSubcategories: 0,
      deletedSubcategories: 2,
      taggedTransactions: 0,
      budgetEntriesMoved: 1,
      budgetEntriesMerged: 0,
      budgetEntriesDropped: 0,
      hiddenPreferenceDropped: false,
      sourceDeleted: true,
    })

    await wrapper
      .find('[data-testid="legacy-category-cat-abos"]')
      .trigger('click')
    await nth(wrapper.findAll('[data-testid="line-choice"]'), 2).setValue(
      'UNFILE'
    )
    await wrapper.find('[data-testid="to-preview"]').trigger('click')
    await flushPromises()
    vi.mocked(api.getLegacyCategories).mockResolvedValue({
      categories: [],
      totalTransactions: 0,
    })
    await wrapper.find('[data-testid="apply-migration"]').trigger('click')
    await flushPromises()

    expect(push).toHaveBeenCalledWith('/settings/categories')
  })
})
