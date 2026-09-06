import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AccountCard from './AccountCard.vue'
import type { AccountDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: { updateAccount: vi.fn() },
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

function account(overrides: Partial<AccountDto> = {}): AccountDto {
  return {
    id: 'acc-1',
    name: 'Compte courant',
    type: 'STANDARD',
    divisor: 1,
    isExcludedFromBudget: false,
    isExcludedFromStats: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('AccountCard', () => {
  it('emits toggle when the header is clicked', async () => {
    const wrapper = mount(AccountCard, {
      props: { account: account(), expanded: false },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  it('emits ask-delete when the delete button is pressed', async () => {
    const wrapper = mount(AccountCard, {
      props: { account: account(), expanded: true },
    })

    await wrapper.get('[data-testid="delete-account"]').trigger('click')

    expect(wrapper.emitted('ask-delete')).toHaveLength(1)
  })

  it('shows no bank-summary row when nothing fills the slot', () => {
    const wrapper = mount(AccountCard, {
      props: { account: account(), expanded: false },
    })

    // No bank has anything to say about this account — no stray border, no
    // empty row.
    expect(wrapper.find('[data-testid="ingest-toggle"]').exists()).toBe(false)
  })

  it('renders bank-summary content even while collapsed', () => {
    const wrapper = mount(AccountCard, {
      props: { account: account(), expanded: false },
      slots: {
        'bank-summary': '<button data-testid="ingest-toggle">Lu</button>',
      },
    })

    expect(wrapper.find('[data-testid="ingest-toggle"]').exists()).toBe(true)
  })

  it('renders bank-link content only inside the expanded body', () => {
    const collapsed = mount(AccountCard, {
      props: { account: account(), expanded: false },
      slots: { 'bank-link': '<p data-testid="reassign">reassign</p>' },
    })
    // `v-show`, not `v-if`: present in the DOM, just hidden.
    const hidden = collapsed.find('[data-testid="reassign"]')
    expect(hidden.exists()).toBe(true)
    expect(hidden.element.closest('[style*="display: none"]')).not.toBeNull()

    const expanded = mount(AccountCard, {
      props: { account: account(), expanded: true },
      slots: { 'bank-link': '<p data-testid="reassign">reassign</p>' },
    })
    expect(
      expanded
        .find('[data-testid="reassign"]')
        .element.closest('[style*="display: none"]')
    ).toBeNull()
  })

  it('badges a joint account with its divisor', () => {
    const wrapper = mount(AccountCard, {
      props: {
        account: account({ type: 'JOINT', divisor: 2 }),
        expanded: false,
      },
    })

    expect(wrapper.text()).toContain('Joint ÷2')
  })

  it('badges an account still carrying rows a sync lost the reference to', () => {
    const wrapper = mount(AccountCard, {
      props: { account: account(), expanded: false, needsReviewCount: 8 },
    })

    expect(wrapper.text()).toContain('8 à réaffecter')
  })

  it('shows no such badge when nothing needs review', () => {
    const wrapper = mount(AccountCard, {
      props: { account: account(), expanded: false },
    })

    expect(wrapper.text()).not.toContain('à réaffecter')
  })
})
