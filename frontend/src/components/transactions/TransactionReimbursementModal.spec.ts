import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import TransactionReimbursementModal from './TransactionReimbursementModal.vue'
import { api } from '@/lib/api'
import type { TransactionDto, PersonDto } from '@/lib/api'
import { usePersonsStore } from '@/stores/persons'

const mockToastError = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ error: mockToastError, success: vi.fn() }),
}))

vi.mock('@/lib/api', () => ({
  api: {
    createReimbursement: vi.fn(),
    createPerson: vi.fn(),
    getPersons: vi.fn(),
  },
}))

const mockTransaction = (
  overrides: Partial<TransactionDto> = {}
): TransactionDto => ({
  id: 'tx-1',
  date: '2026-04-15',
  description: 'Pharmacie',
  amount: -50,
  type: 'EXPENSE',
  accountId: 'acc-1',
  account: 'Checking',
  isPointed: false,
  categoryId: 'cat-sante',
  categoryName: 'Sante',
  categoryIcon: '🩺',
  subcategory: null,
  subcategoryId: null,
  subcategoryName: null,
  note: null,
  createdAt: '2026-04-15T10:00:00.000Z',
  ...overrides,
})

const mockPersons: PersonDto[] = [
  {
    id: 'person-1',
    name: 'Alice',
    email: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
]

const mountModal = (
  overrides: Partial<{ transaction: TransactionDto }> = {}
) => {
  // The modal reads the persons from the store, no longer from a prop.
  usePersonsStore().persons = [...mockPersons]
  return mount(TransactionReimbursementModal, {
    props: {
      isOpen: true,
      transaction: overrides.transaction ?? mockTransaction(),
      remainingAmount: 50,
    },
    global: {
      stubs: { Teleport: true },
    },
  })
}

describe('TransactionReimbursementModal', () => {
  enableAutoUnmount(afterEach)

  it('no longer asks for an income category', () => {
    const wrapper = mountModal()

    // The field existed because the old model routed a refund back to an
    // expense through a category pairing. The deduction now attaches to the
    // expense transaction, which already knows its category. One select
    // remains — the person owing the money.
    expect(wrapper.findAll('select')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Catégorie')
  })

  it('creates the debt from the person, the amount and the note alone', async () => {
    const wrapper = mountModal()
    vi.mocked(api.createReimbursement).mockResolvedValue({
      id: 'reimb-1',
    } as Awaited<ReturnType<typeof api.createReimbursement>>)

    const vm = wrapper.vm as unknown as {
      form: { personId: string; amount: number; note: string }
    }
    vm.form.personId = 'person-1'
    vm.form.amount = 30
    vm.form.note = 'moitie'
    await wrapper.vm.$nextTick()
    const submit = wrapper
      .findAll('button')
      .find(b => b.text().includes('Confirmer'))
    if (!submit) throw new Error('no submit button rendered')
    await submit.trigger('click')
    await flushPromises()

    expect(api.createReimbursement).toHaveBeenCalledWith({
      transactionId: 'tx-1',
      personId: 'person-1',
      amount: 30,
      note: 'moitie',
    })
  })

  it('says why when the debt cannot be created, and stays open', async () => {
    const wrapper = mountModal()
    vi.mocked(api.createReimbursement).mockRejectedValue(
      new Error('Impossible de créer le remboursement')
    )
    const vm = wrapper.vm as unknown as {
      form: { personId: string; amount: number; note: string }
    }
    vm.form.personId = 'person-1'
    vm.form.amount = 30
    await wrapper.vm.$nextTick()
    const submit = wrapper
      .findAll('button')
      .find(b => b.text().includes('Confirmer'))
    if (!submit) throw new Error('no submit button rendered')
    await submit.trigger('click')
    await flushPromises()

    expect(mockToastError).toHaveBeenCalledWith(
      'Impossible de créer le remboursement'
    )
    expect(wrapper.emitted('created')).toBeUndefined()
  })

  describe('« + Nouvelle personne »', () => {
    const confirmButton = (wrapper: ReturnType<typeof mountModal>) => {
      const button = wrapper
        .findAll('button')
        .find(b => b.text().includes('Confirmer'))
      if (!button) throw new Error('no submit button rendered')
      return button
    }

    it('lists the persons from the store', () => {
      const wrapper = mountModal()

      const options = wrapper.findAll('option').map(o => o.text())
      expect(options).toContain('Alice')
    })

    it('is folded when the modal opens', () => {
      const wrapper = mountModal()

      expect(
        wrapper.find('[data-testid="reimbursement-new-person"]').exists()
      ).toBe(true)
      expect(
        wrapper.find('[data-testid="reimbursement-new-person-block"]').exists()
      ).toBe(false)
    })

    it('creates the person, selects it and folds, keeping amount and note', async () => {
      const wrapper = mountModal()
      const created: PersonDto = {
        id: 'person-2',
        name: 'Inès',
        email: 'ines@example.com',
        createdAt: '2026-10-27',
        updatedAt: '2026-10-27',
      }
      vi.mocked(api.createPerson).mockResolvedValue(created)
      const vm = wrapper.vm as unknown as {
        form: { personId: string; amount: number; note: string }
      }
      vm.form.amount = 25
      vm.form.note = 'moitie'

      await wrapper
        .find('[data-testid="reimbursement-new-person"]')
        .trigger('click')
      const create = wrapper.find(
        '[data-testid="reimbursement-new-person-create"]'
      )
      expect(create.attributes('disabled')).toBeDefined()

      await wrapper
        .find(
          '[data-testid="reimbursement-new-person-name"] input, input[data-testid="reimbursement-new-person-name"]'
        )
        .setValue('Inès')
      await wrapper
        .find(
          '[data-testid="reimbursement-new-person-email"] input, input[data-testid="reimbursement-new-person-email"]'
        )
        .setValue('ines@example.com')
      const enabled = wrapper.find(
        '[data-testid="reimbursement-new-person-create"]'
      )
      expect(enabled.attributes('disabled')).toBeUndefined()
      await enabled.trigger('click')
      await flushPromises()

      expect(api.createPerson).toHaveBeenCalledWith({
        name: 'Inès',
        email: 'ines@example.com',
      })
      expect(vm.form.personId).toBe('person-2')
      expect(vm.form.amount).toBe(25)
      expect(vm.form.note).toBe('moitie')
      expect(
        wrapper.find('[data-testid="reimbursement-new-person-block"]').exists()
      ).toBe(false)
      expect(wrapper.findAll('option').map(o => o.text())).toContain('Inès')
    })

    it("keeps the store's error inside the block, which stays open", async () => {
      const wrapper = mountModal()
      vi.mocked(api.createPerson).mockRejectedValue(
        new Error('Une personne porte déjà ce nom')
      )

      await wrapper
        .find('[data-testid="reimbursement-new-person"]')
        .trigger('click')
      await wrapper
        .find(
          '[data-testid="reimbursement-new-person-name"] input, input[data-testid="reimbursement-new-person-name"]'
        )
        .setValue('Alice')
      await wrapper
        .find('[data-testid="reimbursement-new-person-create"]')
        .trigger('click')
      await flushPromises()

      const block = wrapper.find(
        '[data-testid="reimbursement-new-person-block"]'
      )
      expect(block.exists()).toBe(true)
      expect(block.text()).toContain('Une personne porte déjà ce nom')
      expect(
        (wrapper.vm as unknown as { form: { personId: string } }).form.personId
      ).toBe('')
    })

    it('keeps « Confirmer » disabled while no person is chosen, block open or not', async () => {
      const wrapper = mountModal()
      const vm = wrapper.vm as unknown as {
        form: { personId: string; amount: number }
      }
      vm.form.amount = 30
      await wrapper.vm.$nextTick()
      expect(confirmButton(wrapper).attributes('disabled')).toBeDefined()

      await wrapper
        .find('[data-testid="reimbursement-new-person"]')
        .trigger('click')
      await wrapper
        .find(
          '[data-testid="reimbursement-new-person-name"] input, input[data-testid="reimbursement-new-person-name"]'
        )
        .setValue('Inès')
      expect(confirmButton(wrapper).attributes('disabled')).toBeDefined()
    })

    it('folds and empties the block on reset', async () => {
      const wrapper = mountModal()
      await wrapper
        .find('[data-testid="reimbursement-new-person"]')
        .trigger('click')
      await wrapper
        .find(
          '[data-testid="reimbursement-new-person-name"] input, input[data-testid="reimbursement-new-person-name"]'
        )
        .setValue('Inès')

      ;(wrapper.vm as unknown as { resetForm: () => void }).resetForm()
      await wrapper.vm.$nextTick()
      expect(
        wrapper.find('[data-testid="reimbursement-new-person-block"]').exists()
      ).toBe(false)

      await wrapper
        .find('[data-testid="reimbursement-new-person"]')
        .trigger('click')
      const input = wrapper.find(
        '[data-testid="reimbursement-new-person-name"] input, input[data-testid="reimbursement-new-person-name"]'
      ).element as HTMLInputElement
      expect(input.value).toBe('')
    })
  })
})
