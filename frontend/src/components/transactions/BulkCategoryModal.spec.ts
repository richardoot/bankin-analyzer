import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import BulkCategoryModal from './BulkCategoryModal.vue'
import type { CategoryDto, SubcategoryDto } from '@/lib/api'

enableAutoUnmount(afterEach)

const categories: CategoryDto[] = [
  {
    id: 'cat-food',
    name: 'Alimentation',
    type: 'EXPENSE',
    icon: null,
    isExcludedFromBudget: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-transport',
    name: 'Transport',
    type: 'EXPENSE',
    icon: null,
    isExcludedFromBudget: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
]

const subcategories: SubcategoryDto[] = [
  {
    id: 'sub-groceries',
    categoryId: 'cat-food',
    name: 'Courses',
    icon: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sub-fuel',
    categoryId: 'cat-transport',
    name: 'Essence',
    icon: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
]

function mountModal(selectedCount = 412) {
  return mount(BulkCategoryModal, {
    props: {
      isOpen: true,
      categories,
      subcategories,
      selectedCount,
      isUpdating: false,
    },
    global: { stubs: { Teleport: true } },
  })
}

describe('BulkCategoryModal', () => {
  it('spells out how many transactions are about to move', () => {
    const wrapper = mountModal(412)

    expect(wrapper.text()).toContain('Deplacer 412 transactions')
  })

  it('offers only the subcategories of the chosen category', async () => {
    const wrapper = mountModal()

    await wrapper
      .get('[data-testid="bulk-category-select"]')
      .setValue('cat-food')

    const options = wrapper
      .get('[data-testid="bulk-subcategory-select"]')
      .findAll('option')
      .map(o => o.text())
    expect(options).toEqual(['Aucune', 'Courses'])
  })

  it('says the current subcategories will be dropped when none is picked', async () => {
    const wrapper = mountModal()

    await wrapper
      .get('[data-testid="bulk-category-select"]')
      .setValue('cat-food')

    // No correct default exists here, so the screen has to say what happens
    // rather than let the user find out in the dashboard.
    expect(
      wrapper.get('[data-testid="bulk-subcategory-warning"]').text()
    ).toContain('retirees')
  })

  it('says they will be replaced when one is picked', async () => {
    const wrapper = mountModal()

    await wrapper
      .get('[data-testid="bulk-category-select"]')
      .setValue('cat-food')
    await wrapper
      .get('[data-testid="bulk-subcategory-select"]')
      .setValue('sub-groceries')

    expect(
      wrapper.get('[data-testid="bulk-subcategory-warning"]').text()
    ).toContain('remplacees')
  })

  it('forgets the subcategory when the category changes under it', async () => {
    const wrapper = mountModal()

    await wrapper
      .get('[data-testid="bulk-category-select"]')
      .setValue('cat-food')
    await wrapper
      .get('[data-testid="bulk-subcategory-select"]')
      .setValue('sub-groceries')
    // Keeping it would recreate the very mismatch this modal exists to avoid.
    await wrapper
      .get('[data-testid="bulk-category-select"]')
      .setValue('cat-transport')

    await wrapper.get('[data-testid="bulk-category-apply"]').trigger('click')

    expect(wrapper.emitted('apply')?.[0]).toEqual(['cat-transport', null])
  })

  it('emits both halves of the target', async () => {
    const wrapper = mountModal()

    await wrapper
      .get('[data-testid="bulk-category-select"]')
      .setValue('cat-food')
    await wrapper
      .get('[data-testid="bulk-subcategory-select"]')
      .setValue('sub-groceries')
    await wrapper.get('[data-testid="bulk-category-apply"]').trigger('click')

    expect(wrapper.emitted('apply')?.[0]).toEqual(['cat-food', 'sub-groceries'])
  })

  it('stays disabled until a category is chosen', async () => {
    const wrapper = mountModal()

    expect(
      wrapper.get('[data-testid="bulk-category-apply"]').attributes('disabled')
    ).toBeDefined()
    expect(
      wrapper
        .get('[data-testid="bulk-subcategory-select"]')
        .attributes('disabled')
    ).toBeDefined()
  })
})
