import { describe, it, expect } from 'vitest'
import type { TagDto } from '@/lib/api'
import { eventYear, eventYears, splitTagSections } from './tagSections'

function tag(overrides: Partial<TagDto> & { name: string }): TagDto {
  return {
    id: overrides.name,
    color: null,
    icon: null,
    transactionCount: 1,
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
  status: TagDto['status']
): TagDto {
  return tag({
    name,
    isExceptional: true,
    eventStartDate: start,
    eventEndDate: end,
    status,
  })
}

describe('splitTagSections', () => {
  it('sorts each tag into its nature', () => {
    const sections = splitTagSections([
      tag({ name: 'Cadeaux' }),
      tag({ name: 'Achats Logement 2026', isExceptional: true }),
      event('HYROX Paris 2025', '2025-04-12', '2025-04-13', 'past'),
    ])

    expect(sections.events.map(t => t.name)).toEqual(['HYROX Paris 2025'])
    expect(sections.episodes.map(t => t.name)).toEqual(['Achats Logement 2026'])
    expect(sections.themes.map(t => t.name)).toEqual(['Cadeaux'])
  })

  it('puts upcoming events first, then ongoing, then past most recent first', () => {
    const sections = splitTagSections([
      event('Prague 2025', '2025-05-01', '2025-05-04', 'past'),
      event('Rome 2026', '2026-12-05', '2026-12-09', 'upcoming'),
      event('Bayonne 2026', '2026-07-29', '2026-08-02', 'past'),
      event('Concert', '2026-10-18', '2026-10-20', 'ongoing'),
      event('Lyon 2027', '2027-02-10', '2027-02-11', 'upcoming'),
    ])

    expect(sections.events.map(t => t.name)).toEqual([
      'Rome 2026',
      'Lyon 2027',
      'Concert',
      'Bayonne 2026',
      'Prague 2025',
    ])
  })

  it('orders episodes and themes by name', () => {
    const sections = splitTagSections([
      tag({ name: 'Pro' }),
      tag({ name: 'Cadeaux' }),
      tag({ name: 'Zinc', isExceptional: true }),
      tag({ name: 'Appartement', isExceptional: true }),
    ])

    expect(sections.themes.map(t => t.name)).toEqual(['Cadeaux', 'Pro'])
    expect(sections.episodes.map(t => t.name)).toEqual(['Appartement', 'Zinc'])
  })
})

describe('event years', () => {
  it('counts an event in the year its window starts', () => {
    expect(
      eventYear(event('Réveillon', '2025-12-31', '2026-01-01', 'past'))
    ).toBe(2025)
    expect(eventYear(tag({ name: 'Cadeaux' }))).toBeNull()
  })

  it('lists each year once, the most recent first', () => {
    expect(
      eventYears([
        event('A', '2025-05-01', '2025-05-02', 'past'),
        event('B', '2026-05-01', '2026-05-02', 'past'),
        event('C', '2025-08-01', '2025-08-02', 'past'),
      ])
    ).toEqual([2026, 2025])
  })
})
