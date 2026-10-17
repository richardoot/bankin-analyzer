import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ImportHistoryPage from './ImportHistoryPage.vue'
import type { ImportHistoryDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getImportHistories: vi.fn(),
    getLatestImportDate: vi.fn(),
    deleteImport: vi.fn(),
  },
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}))

import { api } from '@/lib/api'

const history: ImportHistoryDto = {
  id: 'imp-1',
  status: 'COMPLETED',
  transactionsImported: 42,
  categoriesCreated: 0,
  duplicatesSkipped: 3,
  totalInFile: 45,
  dateRangeStart: '2026-01-01',
  dateRangeEnd: '2026-01-31',
  accounts: ['Compte courant'],
  fileName: 'export.csv',
  createdAt: '2026-02-01T10:00:00.000Z',
}

async function mountPage() {
  vi.mocked(api.getImportHistories).mockResolvedValue([history])
  vi.mocked(api.getLatestImportDate).mockResolvedValue({ date: null })
  const wrapper = mount(ImportHistoryPage, {
    global: {
      stubs: { Teleport: true, RouterLink: { template: '<a><slot /></a>' } },
    },
  })
  await flushPromises()
  return wrapper
}

const confirmButton = (wrapper: Awaited<ReturnType<typeof mountPage>>) =>
  wrapper
    .findAll('button')
    .filter(b => b.text() === 'Tout supprimer')
    .map(b => b)
    .pop()

describe('ImportHistoryPage — deleting an import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('says the transactions of the import go with it, before deleting', async () => {
    vi.mocked(api.deleteImport).mockResolvedValue(undefined)
    const wrapper = await mountPage()

    await wrapper.get('[data-testid="delete-import-button"]').trigger('click')

    expect(api.deleteImport).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Supprimer cet import ?')
    expect(wrapper.text()).toContain('42 transactions')

    await confirmButton(wrapper)?.trigger('click')
    await flushPromises()

    expect(api.deleteImport).toHaveBeenCalledWith('imp-1')
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('keeps the list and toasts the reason when the deletion fails', async () => {
    vi.mocked(api.deleteImport).mockRejectedValue(
      new Error("Impossible de supprimer l'import")
    )
    const wrapper = await mountPage()

    await wrapper.get('[data-testid="delete-import-button"]').trigger('click')
    await confirmButton(wrapper)?.trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith("Impossible de supprimer l'import")
    expect(wrapper.text()).toContain('export.csv')
  })
})
