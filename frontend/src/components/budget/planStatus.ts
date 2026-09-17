import type { BudgetPlanDto } from '@/lib/api'

export type PlanStatus = 'past' | 'current' | 'future'

/**
 * Where a plan stands relative to today, in UTC like the plan's own dates.
 * Shared by the header (badge) and the page (the warning before editing a
 * closed period) — one clock, not two.
 */
export function planStatus(p: BudgetPlanDto | null): PlanStatus | null {
  if (!p) return null
  const today = new Date()
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  ).getTime()
  const start = new Date(`${p.startDate}T00:00:00Z`).getTime()
  const end = new Date(`${p.endDate}T23:59:59Z`).getTime()
  if (todayUtc < start) return 'future'
  if (todayUtc > end) return 'past'
  return 'current'
}
