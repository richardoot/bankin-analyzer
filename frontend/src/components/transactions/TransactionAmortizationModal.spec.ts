import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import TransactionAmortizationModal from './TransactionAmortizationModal.vue'
import type { TransactionDto } from '@/lib/api'

enableAutoUnmount(afterEach)

const phone = {
  id: 'tx-1',
  date: '2026-06-10T00:00:00.000Z',
  description: 'Apple Store iPhone',
  amount: -1300,
  type: 'EXPENSE',
  amortizationMonths: null,
  tags: [],
} as unknown as TransactionDto

function mountModal(
  props: Partial<
    InstanceType<typeof TransactionAmortizationModal>['$props']
  > = {}
) {
  return mount(TransactionAmortizationModal, {
    props: {
      open: true,
      transaction: phone,
      exceptionalTagNames: [],
      ...props,
    },
    global: { stubs: { Teleport: true } },
  })
}

const sliceText = (wrapper: ReturnType<typeof mountModal>) =>
  wrapper.find('[data-testid="amortization-slice"]').text().replace(/\s/g, ' ')

describe('TransactionAmortizationModal', () => {
  it('offers 24 months first and says the slice and the months it runs', () => {
    const wrapper = mountModal()

    expect(
      wrapper.find<HTMLInputElement>('[data-testid="amortization-preset-24"]')
        .element.checked
    ).toBe(true)
    expect(sliceText(wrapper)).toContain('54,17 € par mois')
    expect(sliceText(wrapper)).toContain('de juin 2026 à mai 2028')
  })

  it('opens on the duration proposed for its subcategory, added when not offered', () => {
    const wrapper = mountModal({
      transaction: {
        ...phone,
        description: 'Canapé',
        subcategoryName: 'Maison et déco',
        suggestedAmortizationMonths: 48,
      } as TransactionDto,
    })

    expect(
      wrapper.find<HTMLInputElement>('[data-testid="amortization-preset-48"]')
        .element.checked
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="amortization-suggested-48"]').text()
    ).toContain('proposé pour Maison et déco')
    expect(
      wrapper.find('[data-testid="amortization-preset-12"]').exists()
    ).toBe(true)
    expect(sliceText(wrapper)).toContain('27,08 € par mois')
  })

  it('opens on 12 months for a repair', () => {
    const wrapper = mountModal({
      transaction: {
        ...phone,
        subcategoryName: 'Entretien et réparation',
        suggestedAmortizationMonths: 12,
      } as TransactionDto,
    })

    expect(
      wrapper.find<HTMLInputElement>('[data-testid="amortization-preset-12"]')
        .element.checked
    ).toBe(true)
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(4)
  })

  it('follows the choice live, a free duration included', async () => {
    const wrapper = mountModal()

    await wrapper.find('[data-testid="amortization-preset-12"]').setValue(true)
    expect(sliceText(wrapper)).toContain('108,33 € par mois')

    await wrapper
      .find('[data-testid="amortization-custom-months"]')
      .setValue('18')
    await wrapper
      .find('[data-testid="amortization-preset-custom"]')
      .setValue(true)
    expect(sliceText(wrapper)).toContain('72,22 € par mois')

    await wrapper.find('[data-testid="amortization-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[18]])
  })

  it('refuses a free duration outside 2 to 60 months', async () => {
    const wrapper = mountModal()

    await wrapper
      .find('[data-testid="amortization-preset-custom"]')
      .setValue(true)
    await wrapper
      .find('[data-testid="amortization-custom-months"]')
      .setValue('61')

    expect(
      wrapper
        .find('[data-testid="amortization-custom-months"]')
        .attributes('aria-invalid')
    ).toBe('true')
    expect(
      wrapper
        .find('[data-testid="amortization-confirm"]')
        .attributes('disabled')
    ).toBeDefined()
  })

  it('spreads the net: reimbursements out, the share of a joint account', () => {
    const wrapper = mountModal({ reimbursedAmount: 100, divisor: 2 })

    // (1300 - 100) / 2 = 600, over 24 months.
    expect(sliceText(wrapper)).toContain('25,00 € par mois')
    expect(wrapper.find('[data-testid="amortization-net"]').text()).toContain(
      'net des remboursements demandés, votre part du compte joint'
    )
  })

  it('opens on the current smoothing and can stop it', async () => {
    const wrapper = mountModal({
      transaction: { ...phone, amortizationMonths: 30 },
    })

    expect(
      wrapper.find<HTMLInputElement>(
        '[data-testid="amortization-custom-months"]'
      ).element.value
    ).toBe('30')
    // Unchanged: nothing to confirm.
    expect(
      wrapper
        .find('[data-testid="amortization-confirm"]')
        .attributes('disabled')
    ).toBeDefined()

    await wrapper.find('[data-testid="amortization-stop"]').trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[null]])
  })

  it('explains the refusal of an exceptional transaction instead of asking', () => {
    const wrapper = mountModal({ exceptionalTagNames: ['Japon 2026'] })

    expect(
      wrapper.find('[data-testid="amortization-blocked"]').text()
    ).toContain('« Japon 2026 »')
    expect(wrapper.find('[data-testid="amortization-confirm"]').exists()).toBe(
      false
    )
    expect(
      wrapper
        .find('[data-testid="amortization-preset-12"]')
        .element.closest('fieldset')
        ?.hasAttribute('disabled')
    ).toBe(true)
  })

  it('does not smooth an income', () => {
    const wrapper = mountModal({
      transaction: { ...phone, type: 'INCOME', amount: 1300 },
    })

    expect(
      wrapper.find('[data-testid="amortization-blocked"]').text()
    ).toContain('Seule une dépense')
  })

  it('shows the server refusal it could not foresee', () => {
    const wrapper = mountModal({ error: 'Refusé par le serveur' })

    expect(wrapper.find('[data-testid="amortization-error"]').text()).toBe(
      'Refusé par le serveur'
    )
  })
})
