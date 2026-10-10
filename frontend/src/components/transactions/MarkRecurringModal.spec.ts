import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import MarkRecurringModal from './MarkRecurringModal.vue'
import type { RecurrenceDto, TransactionDto } from '@/lib/api'

enableAutoUnmount(afterEach)

const transaction = {
  id: 'tx-1',
  date: '2026-03-12T00:00:00.000Z',
  description: 'CB Strava Annual',
  amount: -49.99,
  type: 'EXPENSE',
} as TransactionDto

const strava = {
  merchantKey: 'ireland strava',
  amountBucket: 60,
  name: 'Strava',
  amount: 59.99,
  period: 'YEARLY',
  status: 'ACTIVE',
} as RecurrenceDto

function mountModal(recurrences: RecurrenceDto[] | null = [strava]) {
  return mount(MarkRecurringModal, {
    props: { open: true, transaction, recurrences },
    global: { stubs: { Teleport: true } },
  })
}

describe('MarkRecurringModal', () => {
  it('names the expense and offers the year first', () => {
    const wrapper = mountModal()

    expect(
      wrapper.find('[data-testid="mark-recurring-summary"]').text()
    ).toContain('CB Strava Annual')
    expect(
      wrapper.find<HTMLInputElement>('[data-testid="period-YEARLY"]').element
        .checked
    ).toBe(true)
  })

  it('confirms with the rhythm the user chose', async () => {
    const wrapper = mountModal()

    await wrapper.find('[data-testid="period-QUARTERLY"]').setValue(true)
    await wrapper
      .find('[data-testid="mark-recurring-confirm"]')
      .trigger('click')

    expect(wrapper.emitted('confirm')).toEqual([
      [{ kind: 'new', period: 'QUARTERLY' }],
    ])
  })

  it('attaches the expense to a subscription already followed', async () => {
    const wrapper = mountModal([
      strava,
      {
        ...strava,
        merchantKey: 'spotify',
        name: 'Spotify',
        status: 'CANDIDATE',
      },
    ])

    await wrapper.find('[data-testid="mode-link"]').trigger('click')
    // A candidate is not followed yet: it is not offered.
    expect(wrapper.find('[data-testid="link-targets"]').text()).not.toContain(
      'Spotify'
    )
    expect(
      wrapper
        .find('[data-testid="mark-recurring-confirm"]')
        .attributes('disabled')
    ).toBeDefined()

    await wrapper
      .find('[data-testid="target-60:ireland strava"]')
      .setValue(true)
    await wrapper
      .find('[data-testid="mark-recurring-confirm"]')
      .trigger('click')

    expect(wrapper.emitted('confirm')).toEqual([
      [{ kind: 'link', merchantKey: 'ireland strava', amountBucket: 60 }],
    ])
  })

  it('says so when nothing is followed yet', async () => {
    const wrapper = mountModal([])

    await wrapper.find('[data-testid="mode-link"]').trigger('click')

    expect(wrapper.find('[data-testid="link-targets-empty"]').exists()).toBe(
      true
    )
  })
})
