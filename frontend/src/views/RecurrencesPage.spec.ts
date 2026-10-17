import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import RecurrencesPage from './RecurrencesPage.vue'
import { api } from '@/lib/api'
import type { RecurrenceDto, RecurrenceListDto } from '@/lib/api'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}
vi.mock('@/composables/useToast', () => ({
  useToast: () => mockToast,
}))

function recurrence(overrides: Partial<RecurrenceDto> = {}): RecurrenceDto {
  return {
    id: 'rec-netflix',
    subscriptionId: 'sub-netflix',
    merchantKey: 'europe paypal',
    amountBucket: 15,
    label: 'Prlv Sepa Paypal Europe S.a.r.l',
    name: 'Netflix',
    named: true,
    categoryId: 'cat-leisure',
    categoryName: 'Loisirs et culture',
    categoryIcon: null,
    subcategoryId: 'sub-streaming',
    subcategoryName: 'Streaming, musique et médias',
    nature: 'PLEASURE',
    period: 'MONTHLY',
    amount: 14.99,
    monthlyEquivalent: 14.99,
    occurrences: 8,
    totalPaid: 133.92,
    firstDate: '2026-02-02T00:00:00.000Z',
    lastDate: '2026-09-01T00:00:00.000Z',
    nextExpected: '2026-10-01T00:00:00.000Z',
    status: 'ACTIVE',
    confirmed: false,
    divisor: 1,
    ...overrides,
  }
}

const rent = recurrence({
  id: 'rec-rent',
  merchantKey: 'martin paul',
  amountBucket: 660,
  label: 'Vir Sepa Martin Paul',
  name: 'Martin Paul',
  named: false,
  categoryId: 'cat-housing',
  categoryName: 'Logement',
  subcategoryName: 'Loyer ou crédit immobilier',
  nature: 'ESSENTIAL',
  amount: 660,
  monthlyEquivalent: 660,
  firstDate: '2025-08-07T00:00:00.000Z',
})

function listOf(
  recurrences: RecurrenceDto[],
  overrides: Partial<RecurrenceListDto> = {}
): RecurrenceListDto {
  const active = recurrences.filter(r => r.status === 'ACTIVE')
  return {
    recurrences,
    monthlyTotal: active.reduce((sum, r) => sum + r.monthlyEquivalent, 0),
    byCategory: [],
    byNature: { essential: 660, pleasure: 14.99, unclassified: 0 },
    dismissed: [],
    orphans: [],
    computedAt: '2026-10-07T00:00:00.000Z',
    ...overrides,
  }
}

async function mountPage(list: RecurrenceListDto) {
  vi.spyOn(api, 'getRecurrences').mockResolvedValue(list)
  const wrapper = mount(RecurrencesPage)
  await flushPromises()
  return wrapper
}

describe('RecurrencesPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    push.mockReset()
    mockToast.success.mockReset()
  })

  it('heads the list with the monthly total of the active charges', async () => {
    const wrapper = await mountPage(listOf([recurrence(), rent]))

    const total = wrapper.find('[data-testid="recurrences-total"]').text()
    expect(total).toContain('2 charges actives')
    expect(total).toContain('674,99')
  })

  it('marks a charge paid from a joint account', async () => {
    const wrapper = await mountPage(
      listOf([recurrence(), { ...rent, divisor: 2 }])
    )

    const badges = wrapper.findAll('[data-testid="joint-badge"]')
    expect(badges.map(b => b.text())).toEqual(['Joint ÷2'])
  })

  it('groups the active charges by category, heaviest first', async () => {
    const wrapper = await mountPage(listOf([recurrence(), rent]))

    const groups = wrapper.findAll('[data-testid="recurrence-group"]')
    expect(groups.map(g => g.find('h2').text())).toEqual([
      'Logement',
      'Loisirs et culture',
    ])
  })

  it('sorts by age in one list', async () => {
    const wrapper = await mountPage(listOf([recurrence(), rent]))

    await wrapper.find('[data-testid="recurrences-sort"]').setValue('age')

    const rows = wrapper.findAll('[data-testid="recurrence-row"]')
    expect(rows.map(r => r.text().split('\n')[0])).toHaveLength(2)
    expect(rows[0]?.text()).toContain('Vir Sepa Martin Paul')
  })

  it('opens the transactions of a series by its stable key', async () => {
    const wrapper = await mountPage(listOf([recurrence()]))

    await wrapper.find('[data-testid="recurrence-row"] button').trigger('click')

    expect(push).toHaveBeenCalledWith({
      path: '/transactions',
      query: {
        recurrence: '15:europe paypal',
        recurrenceLabel: 'Netflix',
      },
    })
  })

  it('dismisses with an icon that says what it does', async () => {
    const wrapper = await mountPage(listOf([recurrence()]))

    const button = wrapper.find('[data-testid="dismiss-recurrence"]')
    expect(button.text()).toBe('')
    expect(button.attributes('aria-label')).toBe(
      "Écarter Netflix : ce n'est pas un abonnement"
    )
    expect(button.attributes('title')).toBe(
      "Écarter Netflix : ce n'est pas un abonnement"
    )
  })

  it('shows the service name over the bank label', async () => {
    const wrapper = await mountPage(listOf([recurrence()]))

    const row = wrapper.find('[data-testid="recurrence-row"]')
    expect(row.find('[data-testid="recurrence-name"]').text()).toBe('Netflix')
    expect(row.text()).toContain('Prlv Sepa Paypal Europe S.a.r.l')
  })

  it('renames a series in place', async () => {
    const wrapper = await mountPage(listOf([rent]))
    const rename = vi
      .spyOn(api, 'renameRecurrence')
      .mockResolvedValue(listOf([{ ...rent, name: 'Loyer', named: true }]))

    await wrapper.find('[data-testid="rename-recurrence"]').trigger('click')
    await wrapper
      .find('[data-testid="recurrence-name-input"]')
      .setValue('Loyer')
    await wrapper
      .find('[data-testid="recurrence-name-editor"]')
      .trigger('submit')
    await flushPromises()

    expect(rename).toHaveBeenCalledWith({
      merchantKey: 'martin paul',
      amountBucket: 660,
      name: 'Loyer',
    })
    expect(
      wrapper.find('[data-testid="recurrence-name-editor"]').exists()
    ).toBe(false)
    expect(wrapper.find('[data-testid="recurrence-name"]').text()).toBe('Loyer')
  })

  it('gives a renamed series its labels’ name back', async () => {
    const wrapper = await mountPage(listOf([recurrence()]))
    const rename = vi
      .spyOn(api, 'renameRecurrence')
      .mockResolvedValue(
        listOf([{ ...recurrence(), name: 'Paypal', named: false }])
      )

    await wrapper.find('[data-testid="rename-recurrence"]').trigger('click')
    await wrapper.find('[data-testid="recurrence-name-reset"]').trigger('click')
    await flushPromises()

    expect(rename).toHaveBeenCalledWith({
      merchantKey: 'europe paypal',
      amountBucket: 15,
      name: null,
    })
  })

  it('dismisses a series and shows the list the server answers', async () => {
    const wrapper = await mountPage(listOf([recurrence(), rent]))
    const decide = vi.spyOn(api, 'setRecurrenceDecision').mockResolvedValue(
      listOf([rent], {
        dismissed: [
          {
            id: 'sub-netflix',
            name: 'Netflix',
            state: 'DISMISSED',
            createdAt: '2026-10-07T00:00:00.000Z',
          },
        ],
      })
    )

    const netflixRow = wrapper
      .findAll('[data-testid="recurrence-row"]')
      .find(r => r.text().includes('Paypal'))
    await netflixRow
      ?.find('[data-testid="dismiss-recurrence"]')
      .trigger('click')
    await flushPromises()

    expect(decide).toHaveBeenCalledWith({
      merchantKey: 'europe paypal',
      amountBucket: 15,
      decision: 'DISMISSED',
    })
    expect(wrapper.findAll('[data-testid="recurrence-row"]')).toHaveLength(1)
    expect(
      wrapper.find('[data-testid="recurrence-dismissed"]').text()
    ).toContain('Netflix')
  })

  it('takes a dismissal back by forgetting its subscription', async () => {
    const setAside = {
      id: 'sub-netflix',
      name: 'Netflix',
      state: 'DISMISSED' as const,
      createdAt: '2026-10-07T00:00:00.000Z',
    }
    const wrapper = await mountPage(listOf([rent], { dismissed: [setAside] }))
    const forget = vi
      .spyOn(api, 'deleteSubscription')
      .mockResolvedValue(listOf([recurrence(), rent]))

    await wrapper.find('[data-testid="restore-recurrence"]').trigger('click')
    await flushPromises()

    expect(forget).toHaveBeenCalledWith('sub-netflix')
    expect(wrapper.findAll('[data-testid="recurrence-row"]')).toHaveLength(2)
  })

  it('names the followed subscriptions no series answers any more, and forgets them', async () => {
    const orphan = {
      id: 'sub-strava',
      name: 'Strava',
      state: 'CONFIRMED' as const,
      createdAt: '2026-10-07T00:00:00.000Z',
    }
    const wrapper = await mountPage(listOf([rent], { orphans: [orphan] }))
    const forget = vi
      .spyOn(api, 'deleteSubscription')
      .mockResolvedValue(listOf([rent]))

    expect(wrapper.find('[data-testid="recurrence-orphans"]').text()).toContain(
      'Strava'
    )
    await wrapper.find('[data-testid="forget-orphan"]').trigger('click')
    await flushPromises()

    expect(forget).toHaveBeenCalledWith('sub-strava')
    expect(wrapper.find('[data-testid="recurrence-orphans"]').exists()).toBe(
      false
    )
  })

  it('shows candidates apart, with a way to confirm them', async () => {
    const spotify = recurrence({
      id: 'rec-spotify',
      merchantKey: 'spotify',
      amountBucket: 8,
      label: 'CB Spotify',
      name: 'Spotify',
      amount: 7.99,
      monthlyEquivalent: 7.99,
      occurrences: 2,
      status: 'CANDIDATE',
    })
    const wrapper = await mountPage(listOf([rent, spotify]))
    const decide = vi
      .spyOn(api, 'setRecurrenceDecision')
      .mockResolvedValue(
        listOf([rent, { ...spotify, status: 'ACTIVE', confirmed: true }])
      )

    expect(
      wrapper.find('[data-testid="recurrence-candidates"]').text()
    ).toContain('Spotify')
    await wrapper.find('[data-testid="confirm-recurrence"]').trigger('click')
    await flushPromises()

    expect(decide).toHaveBeenCalledWith({
      merchantKey: 'spotify',
      amountBucket: 8,
      decision: 'CONFIRMED',
    })
    expect(wrapper.find('[data-testid="recurrence-candidates"]').exists()).toBe(
      false
    )
  })

  it('shows since when a current charge runs and what it has cost', async () => {
    const wrapper = await mountPage(listOf([recurrence()]))

    const row = wrapper.find('[data-testid="recurrence-row"]').text()
    expect(row).toContain('depuis févr. 2026')
    expect(row).toContain('133,92')
  })

  it('keeps ended charges in their own tab, latest ended first', async () => {
    const gym = recurrence({
      id: 'rec-gym',
      status: 'STOPPED',
      label: 'Prlv Sepa Basic Fit',
      name: 'Basic Fit',
      amount: 29.99,
      totalPaid: 449.85,
      firstDate: '2025-06-10T00:00:00.000Z',
      lastDate: '2026-08-06T00:00:00.000Z',
    })
    const deezer = recurrence({
      id: 'rec-deezer',
      status: 'STOPPED',
      label: 'Prlv Sepa Deezer',
      name: 'Deezer',
      amount: 10.99,
      totalPaid: 43.96,
      firstDate: '2024-01-05T00:00:00.000Z',
      lastDate: '2024-04-05T00:00:00.000Z',
    })
    const wrapper = await mountPage(listOf([rent, deezer, gym]))

    expect(wrapper.find('[data-testid="tab-ended"]').text()).toContain('(2)')
    expect(wrapper.find('[data-testid="recurrence-ended"]').exists()).toBe(
      false
    )

    await wrapper.find('[data-testid="tab-ended"]').trigger('click')

    const ended = wrapper.find('[data-testid="recurrence-ended"]')
    expect(ended.text()).toContain('493,81')
    const rows = wrapper.findAll('[data-testid="ended-row"]')
    expect(rows[0]?.text()).toContain('Basic Fit')
    expect(rows[0]?.text()).toContain('juin 2025 → août 2026')
    expect(rows[0]?.text()).toContain('1 an 3 mois')
    expect(rows[1]?.text()).toContain('Deezer')
    expect(rows[1]?.text()).toContain('4 mois')
    expect(wrapper.findAll('[data-testid="recurrence-row"]')).toHaveLength(0)
  })

  it('says so when nothing has ended', async () => {
    const wrapper = await mountPage(listOf([rent]))

    await wrapper.find('[data-testid="tab-ended"]').trigger('click')

    expect(wrapper.find('[data-testid="ended-empty"]').exists()).toBe(true)
  })

  it('brings a four-weekly charge to a month', async () => {
    const wrapper = await mountPage(
      listOf([
        recurrence({
          id: 'rec-gym',
          label: 'Prlv Sepa Fitness Park',
          name: 'Fitness Park',
          period: 'FOUR_WEEKLY',
          amount: 50,
          monthlyEquivalent: 54.17,
        }),
      ])
    )

    const row = wrapper.find('[data-testid="recurrence-row"]').text()
    expect(row).toContain('toutes les 4 semaines')
    expect(row).toContain('54,17')
  })

  it('says so when nothing was detected', async () => {
    const wrapper = await mountPage(listOf([]))

    expect(wrapper.text()).toContain('Aucune charge récurrente détectée')
  })

  it('offers to retry when the list cannot be loaded', async () => {
    vi.spyOn(api, 'getRecurrences').mockRejectedValue(new Error('down'))
    const wrapper = mount(RecurrencesPage)
    await flushPromises()

    expect(wrapper.find('[data-testid="recurrences-error"]').exists()).toBe(
      true
    )
  })
})
