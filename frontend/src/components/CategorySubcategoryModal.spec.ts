import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import CategorySubcategoryModal from './CategorySubcategoryModal.vue'
import type { CategoryDto, SubcategoryDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getCategories: vi.fn(),
    getSubcategories: vi.fn(),
    createSubcategory: vi.fn(),
  },
}))

import { api } from '@/lib/api'
import { nth } from '@/test/nth'

const catalog = (
  id: string,
  name: string,
  key: string,
  type: 'EXPENSE' | 'INCOME' = 'EXPENSE'
): CategoryDto => ({
  id,
  name,
  type,
  icon: null,
  catalogKey: key,
  isLocked: true,
  defaultNature: type === 'EXPENSE' ? 'ESSENTIAL' : null,
  defaultRhythm: type === 'EXPENSE' ? 'VARIABLE' : null,
  createdAt: '2026-01-01',
})

const mockCategories: CategoryDto[] = [
  catalog('cat-food', 'Alimentation', 'food'),
  catalog('cat-housing', 'Logement', 'housing'),
  catalog('cat-salary', "Revenus d'activité", 'work-income', 'INCOME'),
  {
    id: 'cat-legacy',
    name: 'Abonnements',
    type: 'EXPENSE',
    icon: null,
    catalogKey: null,
    isLocked: false,
    createdAt: '2026-01-01',
  },
]

const mockSubcategories: SubcategoryDto[] = [
  {
    id: 'sub-rent',
    categoryId: 'cat-housing',
    name: 'Loyer ou crédit immobilier',
    icon: null,
    catalogKey: 'housing.rent',
    isLocked: true,
    nature: 'ESSENTIAL',
    rhythm: 'COMMITTED',
    createdAt: '2026-01-01',
  },
  {
    id: 'sub-housing-other',
    categoryId: 'cat-housing',
    name: 'Autre',
    icon: null,
    catalogKey: 'housing.other',
    isLocked: true,
    nature: 'ESSENTIAL',
    rhythm: 'VARIABLE',
    createdAt: '2026-01-01',
  },
  {
    id: 'sub-groceries',
    categoryId: 'cat-food',
    name: 'Supermarché',
    icon: null,
    catalogKey: 'food.supermarket',
    isLocked: true,
    nature: 'ESSENTIAL',
    rhythm: 'VARIABLE',
    createdAt: '2026-01-01',
  },
]

const baseProps = {
  isOpen: true,
  transactionType: 'EXPENSE' as const,
  currentCategoryId: null,
  currentSubcategoryId: null,
}

const mountModal = async (overrides = {}) => {
  vi.mocked(api.getCategories).mockResolvedValue(
    mockCategories.map(c => ({ ...c }))
  )
  vi.mocked(api.getSubcategories).mockResolvedValue([...mockSubcategories])
  const wrapper = mount(CategorySubcategoryModal, {
    props: { ...baseProps, ...overrides },
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return wrapper
}

describe('CategorySubcategoryModal', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers the catalogue categories of the transaction type, and no way to create one', async () => {
    const wrapper = await mountModal()

    const picks = wrapper.findAll('[data-testid^="pick-category-"]')
    expect(picks).toHaveLength(2)
    expect(nth(picks, 0).text()).toContain('Alimentation')
    expect(nth(picks, 1).text()).toContain('Logement')
    expect(wrapper.text()).not.toContain("Revenus d'activité")
    expect(wrapper.text()).not.toContain('Nouvelle catégorie')
    expect(wrapper.text()).toContain('À classer')
  })

  it('shows a category from before the catalogue greyed, not as a pick', async () => {
    const wrapper = await mountModal()

    const legacy = wrapper.find('[data-testid="legacy-category"]')
    expect(legacy.exists()).toBe(true)
    expect(legacy.text()).toContain('Abonnements')
    expect(legacy.text()).toContain('À migrer')
    expect(legacy.element.tagName).not.toBe('BUTTON')
  })

  it('searches subcategory names too, and files in one click from the hit', async () => {
    const wrapper = await mountModal()

    await wrapper.find('input[type="text"]').setValue('loyer')
    await flushPromises()

    const picks = wrapper.findAll('[data-testid^="pick-category-"]')
    expect(picks).toHaveLength(1)
    expect(picks[0]?.text()).toContain('Logement')
    const hit = wrapper.find('[data-testid="search-hits"] [role="button"]')
    expect(hit.text()).toContain('Loyer')

    await hit.trigger('click')
    await wrapper.find('[data-testid="confirm-filing"]').trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual(['cat-housing', 'sub-rent'])
  })

  it('lists the subcategories of the chosen category with their attributes', async () => {
    const wrapper = await mountModal()

    await wrapper
      .find('[data-testid="pick-category-cat-housing"]')
      .trigger('click')

    const chips = wrapper.findAll('[data-testid^="pick-subcategory-"]')
    expect(chips.map(c => c.text())).toEqual([
      expect.stringContaining('Loyer ou crédit immobilier'),
      expect.stringContaining('Autre'),
    ])
    expect(nth(chips, 0).text()).toContain('Engagé')
    expect(wrapper.text()).toContain('Catégorie seule')
  })

  it('creates a subcategory inside the chosen category and selects it', async () => {
    const wrapper = await mountModal()
    vi.mocked(api.createSubcategory).mockResolvedValue({
      id: 'sub-new',
      categoryId: 'cat-food',
      name: 'Traiteur',
      icon: null,
      catalogKey: null,
      isLocked: false,
      nature: 'ESSENTIAL',
      rhythm: 'VARIABLE',
      createdAt: '2026-01-01',
    })

    await wrapper
      .find('[data-testid="pick-category-cat-food"]')
      .trigger('click')
    await wrapper
      .find('input[aria-label="Nouvelle sous-catégorie"]')
      .setValue('Traiteur')
    await wrapper.find('[data-testid="create-subcategory"]').trigger('click')
    await flushPromises()

    expect(api.createSubcategory).toHaveBeenCalledWith({
      categoryId: 'cat-food',
      name: 'Traiteur',
    })
    await wrapper.find('[data-testid="confirm-filing"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['cat-food', 'sub-new'])
  })

  it('keeps Confirmer disabled until the filing changes', async () => {
    const wrapper = await mountModal({
      currentCategoryId: 'cat-food',
      currentSubcategoryId: 'sub-groceries',
    })

    const confirm = wrapper.find('[data-testid="confirm-filing"]')
    expect(confirm.attributes('disabled')).toBeDefined()

    await wrapper
      .find('[data-testid="pick-category-cat-housing"]')
      .trigger('click')
    expect(confirm.attributes('disabled')).toBeUndefined()
  })

  it('emits a null filing for "À classer"', async () => {
    const wrapper = await mountModal({ currentCategoryId: 'cat-food' })

    await wrapper
      .findAll('button')
      .find(b => b.text() === 'À classer')!
      .trigger('click')
    await wrapper.find('[data-testid="confirm-filing"]').trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual([null, null])
  })
})
