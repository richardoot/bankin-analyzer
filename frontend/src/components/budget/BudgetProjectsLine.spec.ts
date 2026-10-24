import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BudgetProjectsLine from './BudgetProjectsLine.vue'
import type {
  BudgetPlanDto,
  TagBudgetSummaryDto,
  TagBudgetSummaryFamilyDto,
  TagBudgetSummaryItemDto,
  TagDto,
} from '@/lib/api'
import { transactionsLink } from '@/lib/transactionsLink'
import { DATA_HUE, STATE_COLORS } from '@/lib/stateTints'

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

const looseMove: TagBudgetSummaryDto = {
  items: [item('tag-move', 'Déménagement', { budgetAmount: 500, spent: 80 })],
  families: [],
  totalBudget: 500,
  totalSpent: 80,
}

function event(id: string, name: string, color: string | null): TagDto {
  return {
    id,
    name,
    color,
    isExceptional: true,
    eventStartDate: '2026-02-01',
    eventEndDate: '2026-02-10',
  } as TagDto
}

function mountLine(
  projects: TagBudgetSummaryDto | null,
  extra: { plan?: BudgetPlanDto; events?: TagDto[] } = {}
) {
  return mount(BudgetProjectsLine, {
    props: { projects, plan: extra.plan ?? plan, events: extra.events },
  })
}

async function unfold(wrapper: ReturnType<typeof mountLine>) {
  await wrapper.get('[data-testid="budget-projects-toggle"]').trigger('click')
}

describe('BudgetProjectsLine', () => {
  it('stays folded on load: one line, the reserve and its badge', () => {
    const wrapper = mountLine(looseMove)
    const toggle = wrapper.get('[data-testid="budget-projects-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.text()).toContain('Déplier')
    expect(wrapper.find('[data-testid="budget-projects-panel"]').exists()).toBe(
      false
    )
    expect(
      norm(wrapper.get('[data-testid="plan-project-reserve"]').text())
    ).toBe('500,00 € engagés sur 900,00 € de réserve')
    const badge = wrapper.get('[data-testid="reserve-remaining"]')
    expect(norm(badge.text())).toBe('reste 400,00 €')
    expect(badge.attributes('data-tone')).toBe('neutral')
    expect(badge.classes()).toContain('bg-gray-100')
  })

  it('says a reserve spent past in amber', () => {
    const wrapper = mountLine({ ...looseMove, totalBudget: 1100 })
    const badge = wrapper.get('[data-testid="reserve-remaining"]')
    expect(norm(badge.text())).toBe('dépassement de 200,00 €')
    expect(badge.attributes('data-tone')).toBe('over')
    expect(badge.classes()).toContain('bg-amber-50')
  })

  it('says « pas de réserve » on a plan without the equation', () => {
    const wrapper = mountLine(looseMove, {
      plan: { ...plan, projectReserve: null },
    })
    expect(wrapper.find('[data-testid="reserve-remaining"]').exists()).toBe(
      false
    )
    expect(wrapper.find('[data-testid="plan-project-reserve"]').exists()).toBe(
      false
    )
    expect(wrapper.get('[data-testid="projects-no-reserve"]').text()).toBe(
      'pas de réserve'
    )
    expect(norm(wrapper.text())).toContain('500,00 € engagés')
  })

  it('unfolds on the button, which says so', async () => {
    const wrapper = mountLine(looseMove)
    await unfold(wrapper)
    const toggle = wrapper.get('[data-testid="budget-projects-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.text()).toContain('Replier')
    const panel = wrapper.get('[data-testid="budget-projects-panel"]')
    expect(toggle.attributes('aria-controls')).toBe(panel.attributes('id'))
    expect(
      norm(wrapper.get('[data-testid="project-Déménagement"]').text())
    ).toContain('80,00 € / 500,00 €')
    await unfold(wrapper)
    expect(wrapper.find('[data-testid="budget-projects-panel"]').exists()).toBe(
      false
    )
  })

  it('shows a family with an envelope as one line: prorata, spend, its tags', async () => {
    const wrapper = mountLine({
      items: [
        item('tag-move', 'Déménagement', { budgetAmount: 500, spent: 80 }),
      ],
      families: [travel()],
      totalBudget: 800,
      totalSpent: 200,
    })
    await unfold(wrapper)

    const line = wrapper.get('[data-testid="project-family-fam-travel"]')
    expect(norm(line.text())).toContain('Voyages')
    expect(
      norm(line.get('[data-testid="project-family-figures-fam-travel"]').text())
    ).toBe('120,00 € / 300,00 €')
    expect(norm(line.text())).toContain('1 200 € par an')
    // The share bar, in the data hue.
    expect(
      line
        .get('[data-testid="project-family-bar-fam-travel"]')
        .attributes('style')
    ).toContain('width: 40%')
    // Its tag is listed below it, without its own envelope: the family's is
    // the one charged.
    const rome = line.get('[data-testid="project-Rome 2026"]')
    expect(norm(rome.text())).toContain('120,00 €')
    expect(norm(rome.text())).not.toContain('700')
    // The reserve reads the server's total, prorata included.
    expect(
      norm(wrapper.get('[data-testid="plan-project-reserve"]').text())
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

  it('draws the share bar in the data hue, amber past the envelope, figures in ink', async () => {
    const within = mountLine({
      items: [],
      families: [travel()],
      totalBudget: 300,
      totalSpent: 120,
    })
    await unfold(within)
    const hue = (wrapper: ReturnType<typeof mountLine>) =>
      wrapper
        .get('[data-testid="project-family-bar-fam-travel"]')
        .element.getAttribute('style')
    expect(hue(within)).toContain(`background-color: ${DATA_HUE}`)

    const over = mountLine({
      items: [],
      families: [travel({ spent: 450 })],
      totalBudget: 300,
      totalSpent: 450,
    })
    await unfold(over)
    expect(hue(over)).toContain(`background-color: ${STATE_COLORS.over}`)
    const figures = over.get(
      '[data-testid="project-family-figures-fam-travel"]'
    )
    expect(figures.classes()).toContain('text-gray-900')
    expect(figures.classes().some(c => c.startsWith('text-red'))).toBe(false)
    expect(
      over.find('[data-testid="project-family-over-fam-travel"]').exists()
    ).toBe(true)
  })

  it('links the family to its page and to its rows over the plan', async () => {
    const wrapper = mountLine({
      items: [],
      families: [travel()],
      totalBudget: 300,
      totalSpent: 120,
    })
    await unfold(wrapper)

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

  it('keeps a family with no tag in the period: its envelope is committed', async () => {
    const wrapper = mountLine({
      items: [],
      families: [travel({ spent: 0, items: [] })],
      totalBudget: 300,
      totalSpent: 0,
    })
    await unfold(wrapper)

    expect(
      norm(wrapper.get('[data-testid="project-family-fam-travel"]').text())
    ).toContain('Aucune étiquette de la famille sur la période')
  })

  it('opens a project chip’s analysis', async () => {
    const wrapper = mountLine(looseMove)
    await unfold(wrapper)
    await wrapper.get('[data-testid="project-Déménagement"]').trigger('click')
    expect(wrapper.emitted('open-tag')).toEqual([['tag-move']])
  })

  it('lists the period’s events under the projects, each with its colour', async () => {
    const wrapper = mountLine(looseMove, {
      events: [
        event('tag-rome', 'Rome', '#06b6d4'),
        event('tag-bday', 'Anniversaire', null),
      ],
    })
    expect(wrapper.find('[data-testid="project-events"]').exists()).toBe(false)
    await unfold(wrapper)

    const events = wrapper.get('[data-testid="project-events"]')
    expect(
      events.findAll('button').map(b => b.attributes('data-testid'))
    ).toEqual(['project-event-Rome', 'project-event-Anniversaire'])
    // After the projects.
    const panel = wrapper.get('[data-testid="budget-projects-panel"]')
    expect(panel.element.lastElementChild).toBe(events.element)
    expect(
      wrapper
        .get('[data-testid="project-event-Rome"] span')
        .element.getAttribute('style')
    ).toContain('#06b6d4')
    await wrapper.get('[data-testid="project-event-Rome"]').trigger('click')
    expect(wrapper.emitted('open-tag')).toEqual([['tag-rome']])
  })

  it('shows for events alone, with no project', () => {
    const wrapper = mountLine(null, {
      events: [event('tag-rome', 'Rome', null)],
    })
    expect(wrapper.find('[data-testid="budget-projects-line"]').exists()).toBe(
      true
    )
  })

  it('keeps no amber nor teal ground on a reserve held', async () => {
    const wrapper = mountLine(looseMove)
    await unfold(wrapper)
    expect(wrapper.html()).not.toMatch(/\b(?:bg|border)-(?:amber|teal)-/)
  })

  it('renders nothing without a project, a family nor an event', () => {
    const wrapper = mountLine({
      items: [],
      families: [],
      totalBudget: 0,
      totalSpent: 0,
    })

    expect(wrapper.find('[data-testid="budget-projects-line"]').exists()).toBe(
      false
    )
  })
})
