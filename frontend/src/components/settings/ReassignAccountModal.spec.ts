import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReassignAccountModal from './ReassignAccountModal.vue'
import type { PendingReassignment } from './ReassignAccountModal.vue'

vi.mock('@/lib/api', () => ({
  api: { reassignLink: vi.fn() },
}))

import { api } from '@/lib/api'

function pending(
  overrides: Partial<PendingReassignment> = {}
): PendingReassignment {
  return {
    linkId: 'link-1',
    bankAccountName: 'M BOILLEY RICHARD',
    currentAccountLabel: null,
    targetAccountId: 'acc-2',
    targetAccountLabel: 'CJ Fixe',
    preview: {
      moved: 1,
      merged: 0,
      unlinked: 0,
      blockedByWork: 0,
      ambiguous: 0,
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ReassignAccountModal', () => {
  it('renders nothing when there is no pending correction', () => {
    const wrapper = mount(ReassignAccountModal, { props: { pending: null } })
    expect(wrapper.find('[data-testid="reassign-modal"]').exists()).toBe(false)
  })

  it('lists only the lines that are not zero', () => {
    const wrapper = mount(ReassignAccountModal, {
      props: {
        pending: pending({
          preview: {
            moved: 0,
            merged: 2,
            unlinked: 0,
            blockedByWork: 0,
            ambiguous: 0,
          },
        }),
      },
    })

    expect(wrapper.find('[data-testid="reassign-line-moved"]').exists()).toBe(
      false
    )
    expect(
      wrapper.get('[data-testid="reassign-line-merged"]').text()
    ).toContain('2')
  })

  it('flags a blocked or ambiguous row rather than hiding it', () => {
    const wrapper = mount(ReassignAccountModal, {
      props: {
        pending: pending({
          preview: {
            moved: 0,
            merged: 0,
            unlinked: 0,
            blockedByWork: 1,
            ambiguous: 1,
          },
        }),
      },
    })

    expect(
      wrapper.get('[data-testid="reassign-line-blockedByWork"]').text()
    ).toContain('catégorisée')
    expect(
      wrapper.get('[data-testid="reassign-line-ambiguous"]').text()
    ).toContain('trancher')
  })

  it('nudges toward the correct account instead of "aucun"', () => {
    const wrapper = mount(ReassignAccountModal, {
      props: {
        pending: pending({
          targetAccountId: null,
          targetAccountLabel: '— aucun —',
          currentAccountLabel: 'CJ Fixe',
          preview: {
            moved: 0,
            merged: 0,
            unlinked: 8,
            blockedByWork: 0,
            ambiguous: 0,
          },
        }),
      },
    })

    expect(wrapper.get('[data-testid="reassign-aucun-hint"]').text()).toContain(
      'CJ Fixe'
    )
  })

  it('says nothing extra when correcting to a real account', () => {
    const wrapper = mount(ReassignAccountModal, {
      props: { pending: pending() },
    })

    expect(wrapper.find('[data-testid="reassign-aucun-hint"]').exists()).toBe(
      false
    )
  })

  it('confirms by calling reassignLink with the pending target', async () => {
    vi.mocked(api.reassignLink).mockResolvedValue({
      moved: 1,
      merged: 0,
      unlinked: 0,
      blockedByWork: 0,
      ambiguous: 0,
    })
    const wrapper = mount(ReassignAccountModal, {
      props: { pending: pending() },
    })

    await wrapper.get('[data-testid="reassign-confirm"]').trigger('click')
    await flushPromises()

    expect(api.reassignLink).toHaveBeenCalledWith('link-1', 'acc-2')
    expect(wrapper.emitted('reassigned')).toHaveLength(1)
  })

  it('shows the server’s own words when the correction fails', async () => {
    vi.mocked(api.reassignLink).mockRejectedValue(new Error('No such account'))
    const wrapper = mount(ReassignAccountModal, {
      props: { pending: pending() },
    })

    await wrapper.get('[data-testid="reassign-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('No such account')
    expect(wrapper.emitted('reassigned')).toBeUndefined()
  })

  it('emits close without calling the API when cancelled', async () => {
    const wrapper = mount(ReassignAccountModal, {
      props: { pending: pending() },
    })

    await wrapper.get('[data-testid="reassign-cancel"]').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(api.reassignLink).not.toHaveBeenCalled()
  })
})
