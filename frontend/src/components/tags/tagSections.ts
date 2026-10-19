import type { TagDto, TagEventStatus, TagFamilySummaryDto } from '@/lib/api'

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

/** The events of one family, or of none (`family` null, « Sans famille »). */
export interface TagFamilyGroup {
  family: TagFamilySummaryDto | null
  tags: TagDto[]
}

/**
 * The events grouped by family: the families by name, then the events
 * without one last. Within a group the events keep the order they came in
 * (upcoming, ongoing, past). A family with no event here has no group.
 */
export function groupEventsByFamily(
  events: readonly TagDto[]
): TagFamilyGroup[] {
  const byFamily = new Map<string, TagFamilyGroup>()
  const loose: TagDto[] = []
  for (const tag of events) {
    if (!tag.family) {
      loose.push(tag)
      continue
    }
    const group = byFamily.get(tag.family.id)
    if (group) group.tags.push(tag)
    else byFamily.set(tag.family.id, { family: tag.family, tags: [tag] })
  }
  const groups = [...byFamily.values()].sort((a, b) =>
    (a.family?.name ?? '').localeCompare(b.family?.name ?? '')
  )
  if (loose.length > 0) groups.push({ family: null, tags: loose })
  return groups
}
