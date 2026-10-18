import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TransactionRow from './TransactionRow.vue'
import type { ReimbursementDto, TransactionDto } from '@/lib/api'

const tx = (overrides: Partial<TransactionDto> = {}): TransactionDto =>
  ({
    id: 'tx-1',
    date: '2026-09-01T00:00:00.000Z',
    description: 'Carrefour',
    amount: -42.5,
    type: 'EXPENSE',
    accountId: 'acc-1',
    account: 'Compte courant',
    subcategory: null,
    note: null,
    isPointed: false,
    categoryId: 'cat-1',
    categoryName: 'Alimentation',
    categoryIcon: null,
    subcategoryId: null,
    subcategoryName: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }) as TransactionDto

const reimb = (overrides: Partial<ReimbursementDto>): ReimbursementDto =>
  ({
    id: 'r-1',
    transactionId: 'tx-1',
    personId: 'p-1',
    personName: 'Marie',
    amount: 10,
    amountReceived: 0,
    status: 'PENDING',
    ...overrides,
  }) as ReimbursementDto

function mountRow(
  props: Record<string, unknown> = {},
  options: { attachTo?: Element } = {}
) {
  return mount(TransactionRow, {
    props: {
      transaction: tx(),
      reimbursements: [],
      remainingAmount: 42.5,
      allTags: [],
      ...props,
    },
    ...options,
  })
}

describe('TransactionRow', () => {
  describe('a line of a subscription', () => {
    const recurrence = {
      status: 'ACTIVE' as const,
      period: 'MONTHLY' as const,
      merchantKey: 'com netflix',
      amountBucket: 15,
      label: 'CB Netflix.com',
      name: 'Netflix',
      linked: false,
    }

    it('reads apart: an edge, a badge naming its rhythm, no offer to mark it again', async () => {
      const wrapper = mountRow({ transaction: tx({ recurrence }) })

      expect(wrapper.attributes('data-recurring')).toBe('true')
      expect(wrapper.classes()).toContain('border-blue-400')
      const badge = wrapper.find('[data-testid="recurrence-badge"]')
      expect(badge.text()).toBe('Netflix · mensuel')
      expect(wrapper.find('[data-testid="unlink-recurrence"]').exists()).toBe(
        false
      )
      expect(wrapper.find('[data-testid="mark-recurring"]').exists()).toBe(
        false
      )

      await badge.trigger('click')
      expect(wrapper.emitted('show-recurrence')).toHaveLength(1)
    })

    it('says when the subscription has ended', () => {
      const wrapper = mountRow({
        transaction: tx({
          recurrence: { ...recurrence, status: 'STOPPED', period: 'YEARLY' },
        }),
      })

      expect(wrapper.classes()).toContain('border-gray-300')
      expect(wrapper.find('[data-testid="recurrence-badge"]').text()).toMatch(
        /^Netflix · annuel\s+· terminé$/
      )
    })

    it('offers to detach a line the user attached by hand', async () => {
      const wrapper = mountRow({
        transaction: tx({ recurrence: { ...recurrence, linked: true } }),
      })

      const detach = wrapper.find('[data-testid="unlink-recurrence"]')
      expect(detach.attributes('aria-label')).toBe('Détacher de Netflix')
      await detach.trigger('click')
      expect(wrapper.emitted('unlink-recurrence')).toHaveLength(1)
    })

    it('leaves an ordinary line as it was', () => {
      const wrapper = mountRow()

      expect(wrapper.attributes('data-recurring')).toBeUndefined()
      expect(wrapper.classes()).toContain('border-transparent')
      expect(wrapper.find('[data-testid="recurrence-badge"]').exists()).toBe(
        false
      )
    })
  })

  it('greys a transfer amount in both layouts, apart from spending and earning', () => {
    const amounts = (wrapper: ReturnType<typeof mountRow>) =>
      wrapper.findAll('span').filter(s => /^-42,50\s€$/.test(s.text()))

    const transfer = amounts(
      mountRow({ transaction: tx({ type: 'TRANSFER' }) })
    )
    expect(transfer).toHaveLength(2)
    for (const s of transfer) {
      expect(s.classes()).toContain('text-gray-500')
      expect(s.classes()).not.toContain('text-red-600')
    }

    for (const s of amounts(mountRow())) {
      expect(s.classes()).toContain('text-red-600')
    }
  })

  it('paints a transfer category grey in both layouts, never red or green', () => {
    const wrapper = mountRow({ transaction: tx({ type: 'TRANSFER' }) })
    const category = wrapper
      .findAll('button')
      .filter(b => b.text().includes('Alimentation'))
      .filter(b => b.classes().some(c => c.startsWith('bg-')))
    const icon = wrapper.find('button.rounded-xl')

    for (const el of [...category, icon]) {
      expect(el.classes()).toContain('bg-gray-100')
      // Grey like its amount, yet not the faded grey of « Sans catégorie ».
      expect(el.classes()).not.toContain('text-gray-500')
      expect(el.classes().some(c => /^(bg|text)-(red|green)-/.test(c))).toBe(
        false
      )
    }
    expect(category).toHaveLength(1)
  })

  it('offers to follow an expense as a subscription', async () => {
    const wrapper = mountRow()

    await wrapper.find('[data-testid="mark-recurring"]').trigger('click')

    expect(wrapper.emitted('mark-recurring')).toHaveLength(1)
  })

  it('does not offer it on an income, nor while selecting', () => {
    expect(
      mountRow({ transaction: tx({ type: 'INCOME', amount: 100 }) })
        .find('[data-testid="mark-recurring"]')
        .exists()
    ).toBe(false)
    expect(
      mountRow({ selectionMode: true })
        .find('[data-testid="mark-recurring"]')
        .exists()
    ).toBe(false)
  })

  it('renders each datum once per layout, from a single source', () => {
    const wrapper = mountRow()
    // Description and amount appear in both arrangements of the same row.
    expect(wrapper.text()).toContain('Carrefour')
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
  })

  it('initializes the note draft from the stored note when editing opens', async () => {
    const wrapper = mountRow({
      transaction: tx({ note: 'déjà là' }),
    })
    await wrapper.setProps({ isEditingNote: true })

    const input = wrapper.find<HTMLInputElement>('input[type="text"]')
    expect(input.element.value).toBe('déjà là')
  })

  it('emits save-note with the edited draft, not the stored note', async () => {
    const wrapper = mountRow({ transaction: tx({ note: 'avant' }) })
    await wrapper.setProps({ isEditingNote: true })

    await wrapper.find('input[type="text"]').setValue('après')
    await wrapper.find('button[title="Sauvegarder"]').trigger('click')

    expect(wrapper.emitted('save-note')).toEqual([['après']])
  })

  it('summarizes reimbursements: pending total, or « Remboursé » when all completed', async () => {
    const wrapper = mountRow({
      reimbursements: [
        reimb({ id: 'r-1', amount: 10 }),
        reimb({ id: 'r-2', amount: 5 }),
      ],
    })
    expect(wrapper.text()).toContain('en attente')

    await wrapper.setProps({
      reimbursements: [
        reimb({ id: 'r-1', amount: 10, status: 'COMPLETED' }),
        reimb({ id: 'r-2', amount: 5, status: 'COMPLETED' }),
      ],
    })
    expect(wrapper.text()).toContain('Remboursé')
  })

  it('shows the selection checkbox instead of the category icon in selection mode', async () => {
    const wrapper = mountRow({ selectionMode: true, selected: true })
    const boxes = wrapper.findAll('input[type="checkbox"]')
    // One per layout arrangement, both driven by the same `selected` prop.
    expect(boxes.length).toBe(2)
    for (const box of boxes) {
      expect((box.element as HTMLInputElement).checked).toBe(true)
    }
  })

  it('routes actions as events, never calling anything itself', async () => {
    const wrapper = mountRow()
    await wrapper.find('button[title="Pointer"]').trigger('click')
    expect(wrapper.emitted('toggle-pointed')).toHaveLength(1)
  })

  describe('the tappable card (below lg)', () => {
    it('opens the filing dialog from a tap on its quiet area, not from a tap on a control', async () => {
      const wrapper = mountRow()
      const card = wrapper.get('[data-testid="row-card"]')

      await card.trigger('click')
      expect(wrapper.emitted('open-category')).toHaveLength(1)

      await card.get('button[title="Pointer"]').trigger('click')
      expect(wrapper.emitted('toggle-pointed')).toHaveLength(1)
      expect(wrapper.emitted('open-category')).toHaveLength(1)
    })

    it('ticks the line instead while selecting, with no « … » menu', async () => {
      const wrapper = mountRow({ selectionMode: true })
      expect(wrapper.find('[data-testid="row-menu"]').exists()).toBe(false)

      await wrapper.get('[data-testid="row-card"]').trigger('click')
      expect(wrapper.emitted('toggle-select')).toHaveLength(1)
      expect(wrapper.emitted('open-category')).toBeUndefined()

      await wrapper.get('[data-testid="row-grid"]').trigger('click')
      expect(wrapper.emitted('toggle-select')).toHaveLength(2)
    })

    it('does not open anything from a tap while the note is being edited', async () => {
      const wrapper = mountRow({ isEditingNote: true })
      await wrapper.get('[data-testid="row-card"]').trigger('click')
      expect(wrapper.emitted('open-category')).toBeUndefined()
    })

    it('names the truncated texts in full through title', () => {
      const wrapper = mountRow({
        transaction: tx({
          description: 'Carrefour Market Paris 15',
          note: 'une note assez longue',
        }),
      })
      expect(
        wrapper.findAll('[title="Carrefour Market Paris 15"]')
      ).toHaveLength(2)
      expect(wrapper.find('[title="une note assez longue"]').exists()).toBe(
        true
      )
    })
  })

  describe('the « … » menu', () => {
    const openMenu = async (wrapper: ReturnType<typeof mountRow>) => {
      await wrapper
        .get('[data-testid="row-menu"] button[aria-haspopup="menu"]')
        .trigger('click')
      await nextTick()
      return wrapper.findAll('[role="menuitem"]').map(i => i.text())
    }

    it('lists what an expense can do, and routes each item', async () => {
      const wrapper = mountRow({}, { attachTo: document.body })
      expect(await openMenu(wrapper)).toEqual([
        'Modifier la catégorie',
        'Ajouter une note',
        'Ajouter un remboursement',
        'Ajouter une étiquette',
        'Suivre comme abonnement',
      ])

      await wrapper.get('[data-testid="row-menu-note"]').trigger('click')
      expect(wrapper.emitted('start-note')).toHaveLength(1)
      await openMenu(wrapper)
      await wrapper
        .get('[data-testid="row-menu-reimbursement"]')
        .trigger('click')
      expect(wrapper.emitted('open-reimbursement')).toHaveLength(1)
      await openMenu(wrapper)
      await wrapper.get('[data-testid="row-menu-recurring"]').trigger('click')
      expect(wrapper.emitted('mark-recurring')).toHaveLength(1)
      await openMenu(wrapper)
      await wrapper.get('[data-testid="row-menu-category"]').trigger('click')
      expect(wrapper.emitted('open-category')).toHaveLength(1)
      wrapper.unmount()
    })

    it('opens the tag picker where the tags are, and Escape returns to the menu', async () => {
      const wrapper = mountRow({}, { attachTo: document.body })
      await openMenu(wrapper)
      await wrapper.get('[data-testid="row-menu-tag"]').trigger('click')
      await nextTick()

      const search = wrapper.find(
        'input[aria-label="Rechercher ou créer une étiquette"]'
      )
      expect(search.exists()).toBe(true)
      expect(
        wrapper.get('[data-testid="row-tags"]').find('input').exists()
      ).toBe(true)

      await search.trigger('keydown', { key: 'Escape' })
      expect(
        wrapper
          .find('input[aria-label="Rechercher ou créer une étiquette"]')
          .exists()
      ).toBe(false)
      expect(document.activeElement?.getAttribute('aria-label')).toBe(
        'Autres actions'
      )
      wrapper.unmount()
    })

    it('says « Modifier la note » once there is one, and offers nothing a line cannot do', async () => {
      const income = mountRow({
        transaction: tx({ type: 'INCOME', amount: 100, note: 'déjà là' }),
      })
      expect(await openMenu(income)).toEqual([
        'Modifier la catégorie',
        'Modifier la note',
        'Ajouter une étiquette',
      ])
      income.unmount()

      const linked = mountRow({
        transaction: tx({
          recurrence: {
            status: 'ACTIVE',
            period: 'MONTHLY',
            merchantKey: 'com netflix',
            amountBucket: 15,
            label: 'CB Netflix.com',
            name: 'Netflix',
            linked: true,
          },
        }),
      })
      const items = await openMenu(linked)
      expect(items).toContain("Détacher de l'abonnement")
      expect(items).not.toContain('Suivre comme abonnement')
      await linked.get('[data-testid="row-menu-unlink"]').trigger('click')
      expect(linked.emitted('unlink-recurrence')).toHaveLength(1)
      linked.unmount()
    })
  })

  describe('the table row (lg and up)', () => {
    it('keeps its secondary affordances for hover and focus alike, never hover alone', () => {
      const wrapper = mountRow()
      const follow = wrapper.get('[data-testid="mark-recurring"]')
      const tagTrigger = wrapper.get(
        '[data-testid="row-grid"] button[aria-label="Ajouter une étiquette"]'
      )
      const notePlaceholder = wrapper
        .get('[data-testid="row-grid"] button[title="Ajouter une note"]')
        .get('span')

      for (const el of [follow, tagTrigger, notePlaceholder]) {
        expect(el.classes()).toContain('opacity-0')
        expect(el.classes()).toContain('group-hover:opacity-100')
        expect(el.classes()).toContain('group-focus-within:opacity-100')
      }
      expect(wrapper.classes()).toContain('group')
      // The placeholder reads at a usable contrast, not gray-300.
      expect(notePlaceholder.classes()).not.toContain('text-gray-300')
    })

    it('only takes a tags line when there is something on it', async () => {
      const wrapper = mountRow()
      expect(wrapper.get('[data-testid="row-tags"]').classes()).not.toContain(
        'mt-1.5'
      )
      await wrapper.setProps({
        transaction: tx({
          tags: [{ id: 't-1', name: 'Vacances', color: '#f00', icon: null }],
        }),
      })
      const line = wrapper.get('[data-testid="row-tags"]')
      expect(line.classes()).toContain('mt-1.5')
      expect(line.text()).toContain('Vacances')
      // 12px, not the 10px of before.
      expect(line.find('span.rounded-full').classes()).toContain('text-xs')
    })
  })
})
