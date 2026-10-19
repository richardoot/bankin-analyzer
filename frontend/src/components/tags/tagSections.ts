import type { TagDto, TagEventStatus } from '@/lib/api'

/**
 * The tags page reads three natures of tag, which a single alphabetical grid
 * mixed up:
 *
 * - events: a dated window (a trip, a competition, a concert);
 * - undated episodes: exceptional, but with no window (fitting out a flat);
 * - themes: everything else, the long-running contexts (gifts, work).
 *
 * A tag is dated when the server gave it a status, i.e. when both bounds of
 * its window are set — the same rule the server applies.
 */
export interface TagSections {
  events: TagDto[]
  episodes: TagDto[]
  themes: TagDto[]
}

const STATUS_ORDER: Record<TagEventStatus, number> = {
  upcoming: 0,
  ongoing: 1,
  past: 2,
}

/**
 * Upcoming first, the nearest at the top; then ongoing; then past, the most
 * recent first. Within a status, ties break on the name.
 */
function compareEvents(a: TagDto, b: TagDto): number {
  const byStatus =
    STATUS_ORDER[a.status ?? 'past'] - STATUS_ORDER[b.status ?? 'past']
  if (byStatus !== 0) return byStatus
  const startA = a.eventStartDate ?? ''
  const startB = b.eventStartDate ?? ''
  if (startA !== startB) {
    const ascending = startA < startB ? -1 : 1
    return a.status === 'past' ? -ascending : ascending
  }
  return a.name.localeCompare(b.name)
}

export function splitTagSections(tags: readonly TagDto[]): TagSections {
  const events: TagDto[] = []
  const episodes: TagDto[] = []
  const themes: TagDto[] = []
  for (const tag of tags) {
    if (tag.status !== null && tag.eventStartDate) events.push(tag)
    else if (tag.isExceptional) episodes.push(tag)
    else themes.push(tag)
  }
  const byName = (a: TagDto, b: TagDto): number => a.name.localeCompare(b.name)
  return {
    events: events.sort(compareEvents),
    episodes: episodes.sort(byName),
    themes: themes.sort(byName),
  }
}

/** An event belongs to the year its window starts in (a New Year's Eve too). */
export function eventYear(tag: TagDto): number | null {
  return tag.eventStartDate ? Number(tag.eventStartDate.slice(0, 4)) : null
}

/** The years the events start in, the most recent first. */
export function eventYears(events: readonly TagDto[]): number[] {
  const years = new Set<number>()
  for (const tag of events) {
    const year = eventYear(tag)
    if (year !== null) years.add(year)
  }
  return [...years].sort((a, b) => b - a)
}
