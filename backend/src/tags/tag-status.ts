/**
 * Where a dated tag stands relative to today: still to come, under way, or
 * over. Only a tag with a full window has a status — a theme or an undated
 * episode has no "before" or "after".
 */
export type TagEventStatus = 'upcoming' | 'ongoing' | 'past'

export const TAG_EVENT_STATUSES: readonly TagEventStatus[] = [
  'upcoming',
  'ongoing',
  'past',
]

/**
 * The users live in France: "today" is the calendar day in Paris, not the
 * server's UTC day. At 00:30 in Paris the server is still on yesterday, and an
 * event starting that morning would read as upcoming for an hour or two.
 */
export const TAG_STATUS_TIME_ZONE = 'Europe/Paris'

/** The calendar day (`YYYY-MM-DD`) `now` falls on in `timeZone`. */
export function calendarDayIn(
  now: Date,
  timeZone: string = TAG_STATUS_TIME_ZONE
): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Status of an event window against `today`, all three as `YYYY-MM-DD`
 * calendar days (the `@db.Date` columns carry no time of day). Both bounds are
 * included: an event is ongoing on its first and on its last day.
 */
export function tagEventStatus(
  eventStartDate: string | null,
  eventEndDate: string | null,
  today: string
): TagEventStatus | null {
  if (!eventStartDate || !eventEndDate) return null
  if (eventStartDate > today) return 'upcoming'
  if (eventEndDate < today) return 'past'
  return 'ongoing'
}
