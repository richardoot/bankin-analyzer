import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GeneralSettingsPage from './GeneralSettingsPage.vue'
import type { FilterPreferencesDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getFilterPreferences: vi.fn(),
    updateFilterPreferences: vi.fn(),
  },
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}))

import { api } from '@/lib/api'

enableAutoUnmount(afterEach)

const preferences = (
  importCategoriesFromFile: boolean
): FilterPreferencesDto => ({
  hiddenExpenseCategoryIds: [],
  hiddenIncomeCategoryIds: [],
  globalHiddenExpenseCategoryIds: [],
  globalHiddenIncomeCategoryIds: [],
  isPanelExpanded: true,
  importCategoriesFromFile,
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.mocked(api.getFilterPreferences).mockResolvedValue(preferences(true))
  vi.mocked(api.updateFilterPreferences).mockResolvedValue(preferences(false))
})

async function mountPage() {
  const wrapper = mount(GeneralSettingsPage, {
    global: { stubs: { RouterLink: true } },
  })
  await flushPromises()
  return wrapper
}

const toggle = (wrapper: Awaited<ReturnType<typeof mountPage>>) =>
  wrapper.get('[data-testid="import-categories-toggle"]')

describe('GeneralSettingsPage — import categories', () => {
  it('reflects the stored preference', async () => {
    vi.mocked(api.getFilterPreferences).mockResolvedValue(preferences(false))
    const wrapper = await mountPage()

    expect(toggle(wrapper).attributes('aria-checked')).toBe('false')
    expect(wrapper.text()).toContain('Les catégories du fichier sont ignorées')
  })

  it('describes the default behaviour when the preference is on', async () => {
    const wrapper = await mountPage()

    expect(toggle(wrapper).attributes('aria-checked')).toBe('true')
    expect(wrapper.text()).toContain('reprises telles quelles')
  })

  it('sends only this field, leaving the hidden lists alone', async () => {
    const wrapper = await mountPage()

    await toggle(wrapper).trigger('click')
    await flushPromises()

    // The endpoint applies a partial update, so anything else sent here would
    // be a chance to clobber a preference this page knows nothing about.
    expect(api.updateFilterPreferences).toHaveBeenCalledWith({
      importCategoriesFromFile: false,
    })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('puts the switch back when saving fails', async () => {
    vi.mocked(api.updateFilterPreferences).mockRejectedValue(new Error('nope'))
    const wrapper = await mountPage()

    await toggle(wrapper).trigger('click')
    await flushPromises()

    // Showing "off" while the server still says "on" would be worse than the
    // failure itself: the next import would surprise the user.
    expect(toggle(wrapper).attributes('aria-checked')).toBe('true')
    expect(toastError).toHaveBeenCalled()
  })

  it('stays on the default when the preference cannot be read', async () => {
    vi.mocked(api.getFilterPreferences).mockRejectedValue(new Error('offline'))
    const wrapper = await mountPage()

    expect(toggle(wrapper).attributes('aria-checked')).toBe('true')
  })
})
