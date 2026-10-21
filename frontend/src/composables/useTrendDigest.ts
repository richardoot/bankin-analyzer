import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import {
  api,
  type TrendDigestDto,
  type TrendReading,
  type TrendWindow,
  type TrendsResponseDto,
} from '@/lib/api'

export interface TrendDigestInputs {
  /** The list as the card shows it: the digest waits for it. */
  trends: MaybeRefOrGetter<TrendsResponseDto | null>
  /** The window asked for — not the shortened one. */
  window: MaybeRefOrGetter<TrendWindow>
  deductReimbursements: MaybeRefOrGetter<boolean>
  deductPendingReimbursements: MaybeRefOrGetter<boolean>
}

/**
 * The months, readings and windows whose paragraph came back empty or
 * failed in this session. Not asked again until « Régénérer » or the next
 * session (a reload): a model that failed once must not be called on every
 * opening of the dashboard. Module-level, so it outlives the card.
 */
const failedThisSession = new Set<string>()

/** Only for specs: forget what failed. */
export function resetTrendDigestSession(): void {
  failedThisSession.clear()
}

const MODEL_NAMES: Record<string, string> = {
  'claude-haiku-5-5': 'Claude Haiku 5.5',
}

/** « Claude Haiku 5.5 », or the model's id when it has no name here. */
export function modelName(model: string): string {
  return MODEL_NAMES[model] ?? model
}

/**
 * The paragraph Claude wrote under « Ce qui change »
 * (agent-os/product/spending-trends.md, lot 5).
 *
 * Folded behind « Lire le résumé du mois »: asked the first time it is
 * unfolded for a list, never on loading — most openings of the dashboard
 * never read it, and each paragraph not asked is a call not made. A new
 * list (another month, window, reading or switch) folds it again. A
 * failure, a refusal or a paragraph the server rejected all read as no
 * paragraph. The server remembers what it wrote, under a fingerprint of
 * the figures it read, and hands back the last paragraph of the view marked
 * `stale` when the figures moved and it could not write a new one; this
 * remembers, for the session, what it could not write at all.
 */
export function useTrendDigest(inputs: TrendDigestInputs) {
  const digest = ref<TrendDigestDto | null>(null)
  const isLoading = ref(false)
  const isRegenerating = ref(false)
  /** Unfolded on the card. */
  const isOpen = ref(false)
  /** Asked for the list on screen, whatever came back. */
  const hasAnswered = ref(false)

  // A later answer always wins: a month picked twice quickly must not leave
  // the first month's paragraph under the second month's list.
  let sequence = 0

  /** What the paragraph is asked for, or null when there is nothing to tell. */
  function currentQuery() {
    const trends = toValue(inputs.trends)
    // Too short a history or nothing that moved: the server would answer
    // null anyway, without a word the card does not already say.
    if (!trends || trends.insights.length === 0) return null
    return {
      month: trends.month,
      reading: trends.reading as TrendReading,
      window: toValue(inputs.window),
      deductReimbursements: toValue(inputs.deductReimbursements),
      deductPendingReimbursements: toValue(inputs.deductPendingReimbursements),
    }
  }

  const keyOf = (query: NonNullable<ReturnType<typeof currentQuery>>) =>
    [
      query.month,
      query.reading,
      query.window,
      query.deductReimbursements,
      query.deductPendingReimbursements,
    ].join('|')

  async function fetchDigest(): Promise<void> {
    const request = ++sequence
    const query = currentQuery()
    digest.value = null
    hasAnswered.value = false
    if (!query || failedThisSession.has(keyOf(query))) {
      isLoading.value = false
      hasAnswered.value = true
      return
    }
    isLoading.value = true
    const result = await api.getTrendDigest(query).catch(() => null)
    if (request !== sequence) return
    if (result === null) failedThisSession.add(keyOf(query))
    digest.value = result
    isLoading.value = false
    hasAnswered.value = true
  }

  /** Unfolds the paragraph, asking for it the first time for this list. */
  function open(): void {
    isOpen.value = true
    if (!hasAnswered.value && !isLoading.value) void fetchDigest()
  }

  function close(): void {
    isOpen.value = false
  }

  function toggle(): void {
    if (isOpen.value) close()
    else open()
  }

  /**
   * « Régénérer »: written again whatever the server remembers. A failure
   * leaves the paragraph on screen as it was (the server keeps it too, and
   * may hand back a stale one, `stale: true`, which is shown as such).
   */
  async function regenerate(): Promise<void> {
    const query = currentQuery()
    if (!query || isRegenerating.value) return
    const request = ++sequence
    isRegenerating.value = true
    const result = await api.regenerateTrendDigest(query).catch(() => null)
    if (request === sequence) {
      if (result) {
        failedThisSession.delete(keyOf(query))
        digest.value = result
      }
    }
    isRegenerating.value = false
  }

  // A new list — another month, window, reading or switch — is a new
  // paragraph, folded until it is asked for: the answer pending for the
  // last list is dropped.
  watch(
    () => toValue(inputs.trends),
    () => {
      sequence += 1
      digest.value = null
      isLoading.value = false
      hasAnswered.value = false
      isOpen.value = false
    }
  )

  return {
    digest,
    isLoading,
    isRegenerating,
    isOpen,
    hasAnswered,
    fetchDigest,
    regenerate,
    open,
    close,
    toggle,
  }
}
