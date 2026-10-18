import { describe, it, expect, afterEach } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import DuplicatesReviewModal from './DuplicatesReviewModal.vue'
import type { ImportPreviewResultDto, UploadedTransactionDto } from '@/lib/api'

// The link to the row already in the base needs a router to resolve.
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/transactions', component: { template: '<div />' } },
  ],
})

enableAutoUnmount(afterEach)

const uploaded = (
  index: number,
  overrides: Partial<UploadedTransactionDto> = {}
): UploadedTransactionDto => ({
  index,
  date: '2026-01-15',
  description: 'Carrefour Market — courses de la semaine, caisse 4',
  amount: -42.5,
  account: 'Compte courant',
  category: 'Alimentation',
  type: 'EXPENSE',
  ...overrides,
})

const preview: ImportPreviewResultDto = {
  newCount: 10,
  internalDuplicateCount: 2,
  externalDuplicateCount: 1,
  total: 13,
  internalDuplicates: [
    {
      hash: 'h1',
      indices: [3, 7],
      transactions: [uploaded(3), uploaded(7)],
    },
  ],
  externalDuplicates: [
    {
      hash: 'h2',
      uploaded: uploaded(9, { description: 'Netflix' }),
      existing: {
        id: 'tx-1',
        date: '2026-01-15',
        description: 'Netflix',
        amount: -42.5,
        account: 'Compte courant',
        categoryName: 'Abonnements',
        type: 'EXPENSE',
        createdAt: '2025-12-01',
      },
    },
  ],
}

function mountModal(result: ImportPreviewResultDto = preview) {
  return mount(DuplicatesReviewModal, {
    props: { isOpen: true, loading: false, previewResult: result },
    global: { plugins: [router], stubs: { Teleport: true } },
  })
}

const summary = (wrapper: ReturnType<typeof mountModal>) =>
  wrapper.get('[data-testid="import-summary"]').text().replace(/\s+/g, ' ')

describe('DuplicatesReviewModal', () => {
  it('is named, carries the warning badge, and counts what goes in', () => {
    const wrapper = mountModal()

    const dialog = wrapper.get('[role="dialog"]')
    const id = dialog.attributes('aria-labelledby') ?? ''
    expect(wrapper.find(`[id="${id}"]`).text()).toBe('Doublons détectés')
    expect(wrapper.find('[data-testid="modal-tone"]').exists()).toBe(true)
    // 10 new + the first of each internal group, nothing forced from the base.
    expect(summary(wrapper)).toBe('11 à importer, 2 ignorées')
  })

  it('makes the whole row the checkbox label, and keeps the full text in a title', async () => {
    const wrapper = mountModal()

    const row = wrapper.get('[data-testid="internal-row-7"]')
    expect(row.element.tagName).toBe('LABEL')
    expect(row.find('input[type="checkbox"]').exists()).toBe(true)
    expect(row.find('[title]').attributes('title')).toContain(
      'Carrefour Market'
    )

    await row.find('input').setValue(true)

    expect(summary(wrapper)).toBe('12 à importer, 1 ignorées')
  })

  it('offers to force a row already in the base, from a labelled checkbox', async () => {
    const wrapper = mountModal()

    const force = wrapper.get('[data-testid="external-force-9"]')
    expect(force.element.closest('label')?.textContent).toContain(
      'Importer quand même'
    )
    await force.setValue(true)

    expect(summary(wrapper)).toBe('12 à importer, 1 ignorées')
    await wrapper.get('[data-testid="duplicates-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toEqual(new Set([3, 9]))
  })

  it('selects and clears every internal duplicate at once', async () => {
    const wrapper = mountModal()

    await wrapper.get('[data-testid="internal-select-all"]').setValue(true)
    expect(summary(wrapper)).toBe('12 à importer, 1 ignorées')

    await wrapper.get('[data-testid="internal-select-all"]').setValue(false)
    expect(summary(wrapper)).toBe('10 à importer, 3 ignorées')
  })

  it('stacks the comparison on a phone and lays it side by side from md', () => {
    const wrapper = mountModal()

    const comparison = wrapper.get('[data-testid="external-row-9"] .grid')
    expect(comparison.classes()).toContain('grid-cols-1')
    expect(comparison.classes()).toContain('md:grid-cols-2')
    expect(comparison.classes()).not.toContain('sm:grid-cols-2')
  })

  it('locks the import while nothing would go in, and while it runs', async () => {
    const wrapper = mountModal({
      ...preview,
      newCount: 0,
      internalDuplicates: [],
      internalDuplicateCount: 0,
    })

    expect(
      wrapper.get('[data-testid="duplicates-confirm"]').attributes('disabled')
    ).toBeDefined()

    await wrapper.setProps({ loading: true })
    expect(
      wrapper.get('[data-testid="duplicates-confirm"]').attributes('disabled')
    ).toBeDefined()
  })

  it('opens the row already in the base, in a new tab: an import is under way', () => {
    const wrapper = mountModal()

    const link = wrapper.get('[data-testid="existing-transaction-link-9"]')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('href')).toBe('/transactions?ids=tx-1&label=Netflix')
  })
})
