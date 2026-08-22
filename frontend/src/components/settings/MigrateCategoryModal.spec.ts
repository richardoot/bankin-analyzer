import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import MigrateCategoryModal from './MigrateCategoryModal.vue'
import type { CategoryDto, CategoryMigrationPreviewDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getCategoryMigrationPreview: vi.fn(),
    migrateCategory: vi.fn(),
  },
}))

const toastSuccess = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn() }),
}))

import { api } from '@/lib/api'

enableAutoUnmount(afterEach)

const category = (
  id: string,
  name: string,
  type: 'EXPENSE' | 'INCOME' = 'EXPENSE'
): CategoryDto => ({
  id,
  name,
  type,
  icon: null,
  isExcludedFromBudget: false,
  createdAt: '2026-01-01T00:00:00.000Z',
})

const source = category('cat-outings', 'Loisirs & Sorties')
const target = category('cat-leisure', 'Loisirs')
const salary = category('cat-salary', 'Salaire', 'INCOME')

/** One colliding name, one clean, plus a few unfiled transactions. */
const previewBody: CategoryMigrationPreviewDto = {
  sourceCategoryId: source.id,
  sourceCategoryName: source.name,
  targetCategoryId: target.id,
  targetCategoryName: target.name,
  type: 'EXPENSE',
  sourceSubcategories: [
    {
      id: 'src-sport',
      name: 'Sport',
      transactionCount: 48,
      nameTakenInTarget: true,
    },
    {
      id: 'src-music',
      name: 'Musique',
      transactionCount: 12,
      nameTakenInTarget: false,
    },
  ],
  targetSubcategories: [
    { id: 'dst-sport', name: 'Sport' },
    { id: 'dst-cinema', name: 'Cinéma' },
  ],
  uncategorizedCount: 3,
  defaultActions: [
    {
      sourceSubcategoryId: 'src-sport',
      action: 'MERGE',
      targetSubcategoryId: 'dst-sport',
    },
    { sourceSubcategoryId: 'src-music', action: 'MOVE' },
    { sourceSubcategoryId: null, action: 'MOVE' },
  ],
  budgetPlanEntries: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getCategoryMigrationPreview).mockResolvedValue(previewBody)
  vi.mocked(api.migrateCategory).mockResolvedValue({
    sourceCategoryId: source.id,
    targetCategoryId: target.id,
    movedTransactions: 63,
    movedSubcategories: 1,
    mergedSubcategories: 1,
    keptTransactions: 0,
    keptSubcategories: 0,
    sourceLeftEmpty: true,
  })
})

function mountModal(categories: CategoryDto[] = [source, target, salary]) {
  return mount(MigrateCategoryModal, {
    props: { isOpen: true, source, categories },
    global: { stubs: { Teleport: true } },
  })
}

/** Pick the destination and load the mapping table. */
async function openMapping(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[data-testid="migrate-target-select"]').setValue(target.id)
  await wrapper.get('[data-testid="migrate-continue"]').trigger('click')
  await flushPromises()
}

describe('MigrateCategoryModal', () => {
  it('offers only categories of the same type, never the source itself', () => {
    const wrapper = mountModal()

    const options = wrapper
      .get('[data-testid="migrate-target-select"]')
      .findAll('option')
      .map(o => o.text())
    expect(options).toEqual(['Selectionnez une categorie', 'Loisirs'])
  })

  it('says the source survives the move', () => {
    expect(mountModal().text()).toContain('sera conservee')
  })

  it('arrives already decided', async () => {
    const wrapper = mountModal()
    await openMapping(wrapper)

    // Confirming without touching anything is the expected path.
    expect(
      (
        wrapper.get('[data-testid="migrate-action-src-music"]')
          .element as HTMLSelectElement
      ).value
    ).toBe('MOVE')
    expect(
      (
        wrapper.get('[data-testid="migrate-action-src-sport"]')
          .element as HTMLSelectElement
      ).value
    ).toBe('MERGE:dst-sport')
  })

  it('explains why the colliding line has no move option', async () => {
    const wrapper = mountModal()
    await openMapping(wrapper)

    const row = wrapper.get('[data-testid="migrate-row-src-sport"]')
    expect(row.text()).toContain('fusion imposee')
    // The database would refuse it, so it is not offered.
    const values = wrapper
      .get('[data-testid="migrate-action-src-sport"]')
      .findAll('option')
      .map(o => o.attributes('value'))
    expect(values).not.toContain('MOVE')
    // The clean line keeps it.
    expect(
      wrapper
        .get('[data-testid="migrate-action-src-music"]')
        .findAll('option')
        .map(o => o.attributes('value'))
    ).toContain('MOVE')
  })

  it('gives the unfiled transactions a line of their own', async () => {
    const wrapper = mountModal()
    await openMapping(wrapper)

    const row = wrapper.get('[data-testid="migrate-row-uncategorized"]')
    expect(row.text()).toContain('Sans sous-categorie')
    expect(row.text()).toContain('3')
  })

  it('recomputes the summary as decisions change', async () => {
    const wrapper = mountModal()
    await openMapping(wrapper)

    expect(wrapper.get('[data-testid="migrate-summary"]').text()).toContain(
      '63'
    )
    expect(wrapper.get('[data-testid="migrate-summary"]').text()).toContain(
      'conservee, vide'
    )

    await wrapper
      .get('[data-testid="migrate-action-src-sport"]')
      .setValue('KEEP')

    const summary = wrapper.get('[data-testid="migrate-summary"]')
    expect(summary.text()).toContain('15')
    // A partial migration leaves the source populated, and says so.
    expect(summary.text()).toContain('48 transaction(s)')
  })

  it('sends exactly the decisions on screen', async () => {
    const wrapper = mountModal()
    await openMapping(wrapper)

    await wrapper
      .get('[data-testid="migrate-action-src-music"]')
      .setValue('KEEP')
    await wrapper.get('[data-testid="migrate-confirm"]').trigger('click')
    await flushPromises()

    expect(api.migrateCategory).toHaveBeenCalledWith(source.id, target.id, [
      {
        sourceSubcategoryId: 'src-sport',
        action: 'MERGE',
        targetSubcategoryId: 'dst-sport',
      },
      { sourceSubcategoryId: 'src-music', action: 'KEEP' },
      { sourceSubcategoryId: null, action: 'MOVE' },
    ])
    expect(wrapper.emitted('migrated')).toBeTruthy()
  })

  it('keeps the forced merge when taking everything across', async () => {
    const wrapper = mountModal()
    await openMapping(wrapper)

    await wrapper.get('[data-testid="migrate-preset-keep"]').trigger('click')
    await wrapper.get('[data-testid="migrate-preset-default"]').trigger('click')

    // "Take everything across" cannot undo what the unique constraint forbids.
    expect(
      (
        wrapper.get('[data-testid="migrate-action-src-sport"]')
          .element as HTMLSelectElement
      ).value
    ).toBe('MERGE:dst-sport')
  })

  it('refuses to submit when nothing would move', async () => {
    const wrapper = mountModal()
    await openMapping(wrapper)

    await wrapper.get('[data-testid="migrate-preset-keep"]').trigger('click')

    const confirm = wrapper.get('[data-testid="migrate-confirm"]')
    expect(confirm.attributes('disabled')).toBeDefined()
    expect(confirm.text()).toContain('Rien a deplacer')
  })

  it('names the budget line that loses its spending', async () => {
    vi.mocked(api.getCategoryMigrationPreview).mockResolvedValue({
      ...previewBody,
      budgetPlanEntries: [
        {
          planName: 'Second semestre 2026',
          amount: 300,
          startDate: '2026-07-01',
          endDate: '2026-12-31',
        },
      ],
    })
    const wrapper = mountModal()
    await openMapping(wrapper)

    // The one consequence the mapping table cannot show.
    expect(
      wrapper.get('[data-testid="migrate-budget-warning"]').text()
    ).toContain('Second semestre 2026')
  })

  it('shows the server refusal instead of closing', async () => {
    vi.mocked(api.migrateCategory).mockRejectedValue(
      new Error('"Sport" already exists in the destination category')
    )
    const wrapper = mountModal()
    await openMapping(wrapper)

    await wrapper.get('[data-testid="migrate-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="migrate-error"]').text()).toContain(
      'already exists'
    )
    expect(wrapper.emitted('migrated')).toBeFalsy()
  })
})
