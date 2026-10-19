import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TagsPage from './TagsPage.vue'
import { api } from '@/lib/api'
import type { TagDto } from '@/lib/api'

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

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}))

function tag(overrides: Partial<TagDto> & { name: string }): TagDto {
  return {
    id: `id-${overrides.name}`,
    color: '#06b6d4',
    icon: null,
    transactionCount: 3,
    isExceptional: false,
    eventStartDate: null,
    eventEndDate: null,
    budgetAmount: null,
    status: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function event(
  name: string,
  start: string,
  end: string,
  status: TagDto['status'],
  overrides: Partial<TagDto> = {}
): TagDto {
  return tag({
    name,
    isExceptional: true,
    eventStartDate: start,
    eventEndDate: end,
    status,
    ...overrides,
  })
}

const TAGS: TagDto[] = [
  tag({ name: 'Cadeaux' }),
  tag({ name: 'Pro', transactionCount: 0 }),
  tag({ name: 'Achats Logement 2026', isExceptional: true }),
  event('HYROX Paris 2025', '2025-04-12', '2025-04-13', 'past'),
  event('Fêtes de Bayonne 2026', '2026-07-29', '2026-08-02', 'past'),
  event('Concert Bad Bunny Paris 2026', '2026-10-19', '2026-10-19', 'ongoing'),
  event('Rome 2026', '2026-12-05', '2026-12-09', 'upcoming', {
    transactionCount: 0,
  }),
]

async function mountPage(tags: TagDto[] = TAGS) {
  vi.spyOn(api, 'getTags').mockResolvedValue(tags)
  const wrapper = mount(TagsPage)
  await flushPromises()
  return wrapper
}

/** Names of the cards a section shows, in order. */
function cardNames(
  wrapper: Awaited<ReturnType<typeof mountPage>>,
  section: 'events' | 'episodes' | 'themes'
): string[] {
  return wrapper
    .get(`[data-testid="tags-section-${section}"]`)
    .findAll('article h3')
    .map(h => h.text())
}

describe('TagsPage', () => {
  it('splits the tags into events, undated episodes and themes', async () => {
    const wrapper = await mountPage()

    expect(cardNames(wrapper, 'events')).toEqual([
      'Rome 2026',
      'Concert Bad Bunny Paris 2026',
      'Fêtes de Bayonne 2026',
      'HYROX Paris 2025',
    ])
    expect(cardNames(wrapper, 'episodes')).toEqual(['Achats Logement 2026'])
    expect(cardNames(wrapper, 'themes')).toEqual(['Cadeaux', 'Pro'])
    expect(wrapper.findAll('section h2').map(h => h.text())).toEqual([
      'Événements',
      'Épisodes sans date',
      'Thèmes',
    ])
  })

  it('badges each event with where it stands today', async () => {
    const wrapper = await mountPage()

    const badges = wrapper
      .get('[data-testid="tags-section-events"]')
      .findAll('[data-testid="tag-status-badge"]')
      .map(b => b.text())
    expect(badges).toEqual(['À venir', 'En cours', 'Passé', 'Passé'])

    // A theme or an undated episode has no status to show.
    expect(
      wrapper
        .get('[data-testid="tags-section-themes"]')
        .find('[data-testid="tag-status-badge"]')
        .exists()
    ).toBe(false)
    expect(
      wrapper
        .get('[data-testid="tags-section-episodes"]')
        .find('[data-testid="tag-status-badge"]')
        .exists()
    ).toBe(false)
  })

  it('filters the events by the year they start in', async () => {
    const wrapper = await mountPage()

    const options = wrapper
      .get('[data-testid="events-year-filter"]')
      .findAll('[role="radio"]')
      .map(o => o.text())
    expect(options).toEqual(['Toutes', '2026', '2025'])

    await wrapper.get('[data-testid="events-year-2025"]').trigger('click')
    expect(cardNames(wrapper, 'events')).toEqual(['HYROX Paris 2025'])

    await wrapper.get('[data-testid="events-year-2026"]').trigger('click')
    expect(cardNames(wrapper, 'events')).toEqual([
      'Rome 2026',
      'Concert Bad Bunny Paris 2026',
      'Fêtes de Bayonne 2026',
    ])

    // The other sections are not filtered.
    expect(cardNames(wrapper, 'themes')).toEqual(['Cadeaux', 'Pro'])

    await wrapper.get('[data-testid="events-year-all"]').trigger('click')
    expect(cardNames(wrapper, 'events')).toHaveLength(4)
  })

  it('offers no year filter when every event falls in one year', async () => {
    const wrapper = await mountPage([
      event('Rome 2026', '2026-12-05', '2026-12-09', 'upcoming'),
      event('Bayonne 2026', '2026-07-29', '2026-08-02', 'past'),
    ])

    expect(wrapper.find('[data-testid="events-year-filter"]').exists()).toBe(
      false
    )
  })

  it('says on its card that a tag carries no transaction', async () => {
    const wrapper = await mountPage()

    expect(wrapper.get('[data-testid="tag-empty-id-Pro"]').text()).toBe(
      'Aucune transaction'
    )
    expect(
      wrapper.find('[data-testid="tag-transactions-link-id-Pro"]').exists()
    ).toBe(false)
    expect(wrapper.get('[data-testid="tag-empty-id-Rome 2026"]').text()).toBe(
      'Aucune transaction'
    )

    // A used tag still links to its rows.
    expect(
      wrapper.get('[data-testid="tag-transactions-link-id-Cadeaux"]').text()
    ).toContain('3 transaction(s)')
    expect(wrapper.find('[data-testid="tag-empty-id-Cadeaux"]').exists()).toBe(
      false
    )
  })

  it('leaves out a section with no tag', async () => {
    const wrapper = await mountPage([tag({ name: 'Cadeaux' })])

    expect(wrapper.find('[data-testid="tags-section-events"]').exists()).toBe(
      false
    )
    expect(wrapper.find('[data-testid="tags-section-episodes"]').exists()).toBe(
      false
    )
    expect(cardNames(wrapper, 'themes')).toEqual(['Cadeaux'])
  })
})
