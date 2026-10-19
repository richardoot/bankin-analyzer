import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BudgetProjectsSection from './BudgetProjectsSection.vue'
import type {
  BudgetPlanDto,
  TagBudgetSummaryDto,
  TagBudgetSummaryFamilyDto,
  TagBudgetSummaryItemDto,
} from '@/lib/api'
import { transactionsLink } from '@/lib/transactionsLink'

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    resolve: (to: unknown) => ({ href: JSON.stringify(to) }),
  }),
  RouterLink: {
    props: ['to'],
    template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
  },
}))

/** formatCurrency uses narrow no-break spaces; normalise before matching. */
const norm = (text: string): string => text.replace(/\s+/g, ' ')

const plan: BudgetPlanDto = {
  id: 'plan-1',
  name: 'T1 2026',
  startDate: '2026-01-01',
  endDate: '2026-03-31',
  monthCount: 3,
  totalAmount: 1500,
  savingsTarget: 400,
  referenceIncome: 2200,
  projectReserve: 900,
  entries: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function item(
  id: string,
  name: string,
  extra: Partial<TagBudgetSummaryItemDto> = {}
): TagBudgetSummaryItemDto {
  return {
    id,
    name,
    color: null,
    icon: null,
    eventStartDate: null,
    eventEndDate: null,
    budgetAmount: null,
    spent: 0,
    ...extra,
  }
}

function travel(
  extra: Partial<TagBudgetSummaryFamilyDto> = {}
): TagBudgetSummaryFamilyDto {
  return {
    id: 'fam-travel',
    name: 'Voyages',
    color: '#0ea5e9',
    icon: null,
    annualBudget: 1200,
    proratedBudget: 300,
    spent: 120,
    items: [item('tag-rome', 'Rome 2026', { budgetAmount: 700, spent: 120 })],
    ...extra,
  }
}

function mountSection(projects: TagBudgetSummaryDto) {
  return mount(BudgetProjectsSection, { props: { projects, plan } })
}

describe('BudgetProjectsSection', () => {
  it('lists the tags outside any family as before', () => {
    const wrapper = mountSection({
      items: [
        item('tag-move', 'Déménagement', { budgetAmount: 500, spent: 80 }),
      ],
      families: [],
      totalBudget: 500,
      totalSpent: 80,
    })

    expect(
      norm(wrapper.get('[data-testid="project-Déménagement"]').text())
    ).toContain('80,00 € / 500,00 €')
    expect(
      norm(wrapper.get('[data-testid="reserve-remaining"]').text())
    ).toContain('500,00 € engagés sur 900,00 € de réserve')
  })

  it('shows a family with an envelope as one line: prorata, spend, its tags', () => {
    const wrapper = mountSection({
      items: [
        item('tag-move', 'Déménagement', { budgetAmount: 500, spent: 80 }),
      ],
      families: [travel()],
      totalBudget: 800,
      totalSpent: 200,
    })

    const line = wrapper.get('[data-testid="project-family-fam-travel"]')
    expect(norm(line.text())).toContain('Voyages')
    expect(
      norm(line.get('[data-testid="project-family-figures-fam-travel"]').text())
    ).toBe('120,00 € / 300,00 €')
    expect(norm(line.text())).toContain('1 200 € par an')
    // Its tag is listed below it, without its own envelope: the family's is
    // the one charged.
    const rome = line.get('[data-testid="project-Rome 2026"]')
    expect(norm(rome.text())).toContain('120,00 €')
    expect(norm(rome.text())).not.toContain('700')
    // The reserve reads the server's total, prorata included.
    expect(
      norm(wrapper.get('[data-testid="reserve-remaining"]').text())
    ).toContain('800,00 € engagés sur 900,00 € de réserve')
    // The loose tags come after the families.
    expect(
      wrapper
        .findAll(
          '[data-testid="project-family-fam-travel"], [data-testid="project-tags"]'
        )
        .map(el => el.attributes('data-testid'))
    ).toEqual(['project-family-fam-travel', 'project-tags'])
  })

  it('links the family to its page and to its rows over the plan', () => {
    const wrapper = mountSection({
      items: [],
      families: [travel()],
      totalBudget: 300,
      totalSpent: 120,
    })

    expect(
      JSON.parse(
        wrapper
          .get('[data-testid="project-family-link-fam-travel"]')
          .attributes('data-to') ?? 'null'
      )
    ).toEqual({ name: 'tag-family', params: { id: 'fam-travel' } })
    expect(
      wrapper.getComponent({ name: 'TransactionsLink' }).props('to')
    ).toEqual(
      transactionsLink({
        tagFamilyId: 'fam-travel',
        from: '2026-01-01',
        to: '2026-03-31',
        gross: true,
        label: 'Voyages',
      })
    )
  })

  it('keeps a family with no tag in the period: its envelope is committed', () => {
    const wrapper = mountSection({
      items: [],
      families: [travel({ spent: 0, items: [] })],
      totalBudget: 300,
      totalSpent: 0,
    })

    expect(wrapper.find('[data-testid="budget-projects"]').exists()).toBe(true)
    expect(
      norm(wrapper.get('[data-testid="project-family-fam-travel"]').text())
    ).toContain('Aucune étiquette de la famille sur la période')
  })

  it('says a family overrun in red', () => {
    const wrapper = mountSection({
      items: [],
      families: [travel({ spent: 450 })],
      totalBudget: 300,
      totalSpent: 450,
    })

    expect(
      wrapper.get('[data-testid="project-family-figures-fam-travel"]').classes()
    ).toContain('text-red-600')
  })

  it('renders nothing without a project nor a family', () => {
    const wrapper = mountSection({
      items: [],
      families: [],
      totalBudget: 0,
      totalSpent: 0,
    })

    expect(wrapper.find('[data-testid="budget-projects"]').exists()).toBe(false)
  })
})
