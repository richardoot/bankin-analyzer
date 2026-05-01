import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import CategorySubcategoryModal from './CategorySubcategoryModal.vue'

vi.mock('@/lib/api', () => ({
  api: {
    getCategories: vi.fn(),
    getSubcategoriesByCategory: vi.fn(),
    createCategory: vi.fn(),
    createSubcategory: vi.fn(),
  },
}))

import { api } from '@/lib/api'

const mockCategories = [
  {
    id: 'cat-1',
    name: 'Courses',
    type: 'EXPENSE' as const,
    icon: '🛒',
    createdAt: '2026-01-01',
  },
  {
    id: 'cat-2',
    name: 'Transport',
    type: 'EXPENSE' as const,
    icon: '🚗',
    createdAt: '2026-01-01',
  },
  {
    id: 'cat-3',
    name: 'Salaire',
    type: 'INCOME' as const,
    icon: '💼',
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
  // Return a fresh copy each time — the component pushes into this array on
  // creation, which would otherwise mutate the shared mockCategories reference
  // and pollute subsequent tests.
  vi.mocked(api.getCategories).mockResolvedValue(
    mockCategories.map(c => ({ ...c }))
  )
  vi.mocked(api.getSubcategoriesByCategory).mockResolvedValue([])
  const wrapper = mount(CategorySubcategoryModal, {
    props: { ...baseProps, ...overrides },
    global: {
      stubs: { Teleport: true },
    },
  })
  await flushPromises()
  return wrapper
}

describe('CategorySubcategoryModal — create category', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the create category input with the right placeholder for EXPENSE', async () => {
    const wrapper = await mountModal({ transactionType: 'EXPENSE' })

    const input = wrapper.find('input[placeholder^="Nouvelle categorie"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toContain('depense')
  })

  it('renders the create category input with the right placeholder for INCOME', async () => {
    const wrapper = await mountModal({ transactionType: 'INCOME' })

    const input = wrapper.find('input[placeholder^="Nouvelle categorie"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toContain('revenu')
  })

  it('disables the Creer button when input is empty', async () => {
    const wrapper = await mountModal()
    const createBtn = wrapper
      .findAll('button')
      .find(b => b.text() === 'Creer' && b.attributes('type') === 'button')

    expect(createBtn?.attributes('disabled')).toBeDefined()
  })

  it('enables the Creer button when input has a value', async () => {
    const wrapper = await mountModal()
    const input = wrapper.find('input[placeholder^="Nouvelle categorie"]')
    await input.setValue('Sante')

    const createBtn = wrapper
      .findAll('button')
      .find(b => b.text() === 'Creer' && b.attributes('type') === 'button')
    expect(createBtn?.attributes('disabled')).toBeUndefined()
  })

  it('calls api.createCategory with trimmed name and current transactionType', async () => {
    vi.mocked(api.createCategory).mockResolvedValue({
      id: 'cat-new',
      name: 'Sante',
      type: 'EXPENSE',
      icon: null,
      createdAt: '2026-04-26',
    })

    const wrapper = await mountModal({ transactionType: 'EXPENSE' })
    const input = wrapper.find('input[placeholder^="Nouvelle categorie"]')
    await input.setValue('  Sante  ')

    const createBtn = wrapper
      .findAll('button')
      .find(b => b.text() === 'Creer' && b.attributes('type') === 'button')
    await createBtn?.trigger('click')
    await flushPromises()

    expect(api.createCategory).toHaveBeenCalledWith({
      name: 'Sante',
      type: 'EXPENSE',
    })
  })

  it('does not call api.createCategory when input is empty', async () => {
    const wrapper = await mountModal()
    const input = wrapper.find('input[placeholder^="Nouvelle categorie"]')
    await input.setValue('   ')

    const createBtn = wrapper
      .findAll('button')
      .find(b => b.text() === 'Creer' && b.attributes('type') === 'button')
    await createBtn?.trigger('click')
    await flushPromises()

    expect(api.createCategory).not.toHaveBeenCalled()
  })

  it('selects existing category instead of creating a duplicate (case-insensitive)', async () => {
    const wrapper = await mountModal({ transactionType: 'EXPENSE' })
    const input = wrapper.find('input[placeholder^="Nouvelle categorie"]')
    // "courses" already exists as "Courses"
    await input.setValue('courses')

    const createBtn = wrapper
      .findAll('button')
      .find(b => b.text() === 'Creer' && b.attributes('type') === 'button')
    await createBtn?.trigger('click')
    await flushPromises()

    // No API call to create
    expect(api.createCategory).not.toHaveBeenCalled()
    // Input is cleared
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('allows creating a category with same name but different type', async () => {
    vi.mocked(api.createCategory).mockResolvedValue({
      id: 'cat-new',
      name: 'Salaire',
      type: 'EXPENSE',
      icon: null,
      createdAt: '2026-04-26',
    })

    // We're on EXPENSE; "Salaire" exists as INCOME → should still allow creating EXPENSE/Salaire
    const wrapper = await mountModal({ transactionType: 'EXPENSE' })
    const input = wrapper.find('input[placeholder^="Nouvelle categorie"]')
    await input.setValue('Salaire')

    const createBtn = wrapper
      .findAll('button')
      .find(b => b.text() === 'Creer' && b.attributes('type') === 'button')
    await createBtn?.trigger('click')
    await flushPromises()

    expect(api.createCategory).toHaveBeenCalledWith({
      name: 'Salaire',
      type: 'EXPENSE',
    })
  })

  it('adds the newly created category to the list and selects it', async () => {
    const newCategory = {
      id: 'cat-new',
      name: 'Sante',
      type: 'EXPENSE' as const,
      icon: null,
      createdAt: '2026-04-26',
    }
    vi.mocked(api.createCategory).mockResolvedValue(newCategory)

    const wrapper = await mountModal({ transactionType: 'EXPENSE' })
    const input = wrapper.find('input[placeholder^="Nouvelle categorie"]')
    await input.setValue('Sante')

    const createBtn = wrapper
      .findAll('button')
      .find(b => b.text() === 'Creer' && b.attributes('type') === 'button')
    await createBtn?.trigger('click')
    await flushPromises()

    // Newly created category should appear in the list
    expect(wrapper.text()).toContain('Sante')
    // Subcategories endpoint should be called for the new category (auto-select side-effect)
    expect(api.getSubcategoriesByCategory).toHaveBeenCalledWith('cat-new')
  })

  it('does not add the new category to the list when API call fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(api.createCategory).mockRejectedValue(new Error('Server error'))

    const wrapper = await mountModal()
    const input = wrapper.find('input[placeholder^="Nouvelle categorie"]')
    await input.setValue('Sante')

    const createBtn = wrapper
      .findAll('button')
      .find(b => b.text().trim() === 'Creer')
    await createBtn?.trigger('click')
    await flushPromises()

    expect(api.createCategory).toHaveBeenCalledOnce()
    const categoryButtons = wrapper.findAll('button.group')
    expect(categoryButtons.some(b => b.text().includes('Sante'))).toBe(false)

    errorSpy.mockRestore()
  })

  it('triggers create on Enter key', async () => {
    vi.mocked(api.createCategory).mockResolvedValue({
      id: 'cat-new',
      name: 'Sante',
      type: 'EXPENSE',
      icon: null,
      createdAt: '2026-04-26',
    })

    const wrapper = await mountModal()
    const inputs = wrapper.findAll('input[placeholder^="Nouvelle categorie"]')
    const input = inputs[inputs.length - 1]
    if (!input) throw new Error('input not found')
    await input.setValue('Sante')
    await input.trigger('keyup', { key: 'Enter' })
    await flushPromises()

    expect(api.createCategory).toHaveBeenCalled()
  })
})
