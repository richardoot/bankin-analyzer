import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TagsPage from './TagsPage.vue'
import { api } from '@/lib/api'
import type { TagDto, TagFamilyDto } from '@/lib/api'

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
    familyId: null,
    family: null,
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

async function mountPage(tags: TagDto[] = TAGS, families: TagFamilyDto[] = []) {
  // Copies: the store edits what it holds, which must not leak into the
  // fixtures of the next test.
  vi.spyOn(api, 'getTags').mockResolvedValue(structuredClone(tags))
  vi.spyOn(api, 'getTagFamilies').mockResolvedValue(structuredClone(families))
  // Dialogs render in place, so their content can be read and clicked.
  const wrapper = mount(TagsPage, { global: { stubs: { Teleport: true } } })
  await flushPromises()
  return wrapper
}

function family(
  id: string,
  name: string,
  overrides: Partial<TagFamilyDto> = {}
): TagFamilyDto {
  return {
    id,
    name,
    color: '#22c55e',
    icon: null,
    annualBudget: null,
    tagCount: 0,
    createdAt: '2026-10-19T00:00:00Z',
    updatedAt: '2026-10-19T00:00:00Z',
    ...overrides,
  }
}

/** A tag filed under a family, as the server names it. */
function inFamily(t: TagDto, f: TagFamilyDto): TagDto {
  return {
    ...t,
    familyId: f.id,
    family: { id: f.id, name: f.name, color: f.color },
  }
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

  describe('families', () => {
    const trips = family('fam-t', 'Voyages')
    const races = family('fam-r', 'Compétitions', { color: '#ef4444' })
    const FAMILY_TAGS: TagDto[] = [
      tag({ name: 'Cadeaux' }),
      inFamily(
        event('HYROX Paris 2025', '2025-04-12', '2025-04-13', 'past'),
        races
      ),
      inFamily(
        event('HYROX Lyon 2026', '2026-05-02', '2026-05-03', 'past'),
        races
      ),
      event(
        'Concert Bad Bunny Paris 2026',
        '2026-10-19',
        '2026-10-19',
        'ongoing'
      ),
      inFamily(
        event('Rome 2026', '2026-12-05', '2026-12-09', 'upcoming'),
        trips
      ),
      inFamily(event('Prague 2025', '2025-08-01', '2025-08-07', 'past'), trips),
    ]

    /** Each group of the events section: its heading, then its cards. */
    function groups(
      wrapper: Awaited<ReturnType<typeof mountPage>>
    ): [string, string[]][] {
      return wrapper
        .get('[data-testid="tags-section-events"]')
        .findAll('[data-testid^="tags-family-group-"]')
        .map(g => [
          g.get('h3').text(),
          g.findAll('article h3').map(h => h.text()),
        ])
    }

    it('groups the events by family, those without one last', async () => {
      const wrapper = await mountPage(FAMILY_TAGS, [races, trips])

      expect(groups(wrapper)).toEqual([
        ['Compétitions', ['HYROX Lyon 2026', 'HYROX Paris 2025']],
        ['Voyages', ['Rome 2026', 'Prague 2025']],
        ['Sans famille', ['Concert Bad Bunny Paris 2026']],
      ])
      // Themes are not grouped.
      expect(cardNames(wrapper, 'themes')).toEqual(['Cadeaux'])
    })

    it('still filters the grouped events by year', async () => {
      const wrapper = await mountPage(FAMILY_TAGS, [races, trips])

      await wrapper.get('[data-testid="events-year-2025"]').trigger('click')

      expect(groups(wrapper)).toEqual([
        ['Compétitions', ['HYROX Paris 2025']],
        ['Voyages', ['Prague 2025']],
      ])
    })

    it('keeps a single grid while the user has no family', async () => {
      const wrapper = await mountPage()

      expect(groups(wrapper)).toEqual([])
      expect(wrapper.text()).not.toContain('Sans famille')
      expect(
        wrapper.find('[data-testid="tags-section-families"]').exists()
      ).toBe(false)
    })

    it('files a new tag under a suggested family, created on confirmation only', async () => {
      const created = family('fam-new', 'Voyages')
      const createFamily = vi
        .spyOn(api, 'createTagFamily')
        .mockResolvedValue(created)
      const createTag = vi
        .spyOn(api, 'createTag')
        .mockResolvedValue(
          inFamily(tag({ name: 'Lisbonne 2027', isExceptional: true }), created)
        )
      const wrapper = await mountPage([tag({ name: 'Cadeaux' })])

      await wrapper
        .get('[data-testid="new-tag-name"]')
        .setValue('Lisbonne 2027')
      await wrapper.get('[data-testid="new-tag-exceptional"]').setValue(true)
      await wrapper
        .get('select[data-testid="new-tag-family"]')
        .setValue('suggestion:Voyages')
      expect(createFamily).not.toHaveBeenCalled()

      await wrapper
        .get('[data-testid="new-tag-new-family-create"]')
        .trigger('click')
      await flushPromises()
      expect(createFamily).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Voyages' })
      )

      await wrapper.get('[data-testid="create-tag"]').trigger('submit')
      await flushPromises()
      expect(createTag).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Lisbonne 2027',
          isExceptional: true,
          familyId: 'fam-new',
        })
      )
    })

    it('moves a tag into a family from its edit dialog', async () => {
      const rome = event('Rome 2026', '2026-12-05', '2026-12-09', 'upcoming')
      const updateTag = vi
        .spyOn(api, 'updateTag')
        .mockResolvedValue(inFamily(rome, trips))
      const wrapper = await mountPage([rome], [trips])

      await wrapper.get('[data-testid="edit-tag-Rome 2026"]').trigger('click')
      await wrapper
        .get('select[data-testid="edit-tag-family"]')
        .setValue('fam-t')
      await wrapper.get('[data-testid="save-tag"]').trigger('click')
      await flushPromises()

      expect(updateTag).toHaveBeenCalledWith(
        rome.id,
        expect.objectContaining({ familyId: 'fam-t' })
      )
      expect(groups(wrapper)).toEqual([['Voyages', ['Rome 2026']]])
    })

    it('renames a family from its group heading', async () => {
      const updateFamily = vi
        .spyOn(api, 'updateTagFamily')
        .mockResolvedValue({ ...trips, name: 'Vacances' })
      const wrapper = await mountPage(FAMILY_TAGS, [races, trips])

      await wrapper.get('[data-testid="edit-family-fam-t"]').trigger('click')
      await wrapper.get('[data-testid="edit-family-name"]').setValue('Vacances')
      await wrapper.get('[data-testid="save-family"]').trigger('click')
      await flushPromises()

      expect(updateFamily).toHaveBeenCalledWith('fam-t', {
        name: 'Vacances',
        color: '#22c55e',
      })
      expect(groups(wrapper).map(([name]) => name)).toEqual([
        'Compétitions',
        'Vacances',
        'Sans famille',
      ])
    })

    it('deletes a family after saying its tags are kept, without one', async () => {
      const deleteFamily = vi
        .spyOn(api, 'deleteTagFamily')
        .mockResolvedValue(undefined)
      const wrapper = await mountPage(FAMILY_TAGS, [races, trips])

      await wrapper.get('[data-testid="delete-family-fam-r"]').trigger('click')
      const dialog = wrapper.get('[data-testid="delete-family-dialog"]')
      expect(dialog.text()).toContain(
        'Ses 2 étiquette(s) sont conservées, sans famille.'
      )
      expect(deleteFamily).not.toHaveBeenCalled()

      await dialog
        .get('[data-testid="confirm-dialog-confirm"]')
        .trigger('click')
      await flushPromises()

      expect(deleteFamily).toHaveBeenCalledWith('fam-r')
      expect(groups(wrapper)).toEqual([
        ['Voyages', ['Rome 2026', 'Prague 2025']],
        [
          'Sans famille',
          [
            'Concert Bad Bunny Paris 2026',
            'HYROX Lyon 2026',
            'HYROX Paris 2025',
          ],
        ],
      ])
    })

    it('opens a family’s page from its group heading and from its row', async () => {
      const wrapper = await mountPage(FAMILY_TAGS, [races, trips])

      const familyPage = JSON.stringify({
        name: 'tag-family',
        params: { id: 'fam-r' },
      })
      expect(
        wrapper.get('[data-testid="family-group-link-fam-r"]').attributes()
      ).toMatchObject({ 'data-to': familyPage })
      expect(
        wrapper.get('[data-testid="family-row-link-fam-r"]').attributes()
      ).toMatchObject({ 'data-to': familyPage })
      // « Sans famille » is no family: no page to open.
      expect(
        wrapper
          .get('[data-testid="tags-family-group-none"] h3')
          .find('a')
          .exists()
      ).toBe(false)
    })

    it('links each family to its transactions', async () => {
      const wrapper = await mountPage(FAMILY_TAGS, [races, trips])

      const link = wrapper.get('[data-testid="family-transactions-link-fam-t"]')
      expect(link.attributes('data-to')).toBe(
        JSON.stringify({ path: '/transactions', query: { family: 'fam-t' } })
      )
    })
  })
})
