import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import ImportRecapPage from './ImportRecapPage.vue'

describe('ImportRecapPage', () => {
  const createRouterWithQuery = (query: Record<string, string>) => {
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
        {
          path: '/import',
          name: 'import',
          component: { template: '<div>Import</div>' },
        },
        {
          path: '/profile',
          name: 'profile',
          component: { template: '<div>Profile</div>' },
        },
        {
          path: '/import/recap',
          name: 'import-recap',
          component: ImportRecapPage,
        },
      ],
    })

    router.push({ name: 'import-recap', query })
    return router
  }

  it('should display import statistics', async () => {
    const router = createRouterWithQuery({
      imported: '45',
      duplicates: '5',
      total: '50',
      categories: '12',
    })

    await router.isReady()

    const wrapper = mount(ImportRecapPage, {
      global: {
        plugins: [router],
      },
    })

    expect(wrapper.text()).toContain('Import terminé')
    expect(wrapper.text()).toContain('45') // imported
    expect(wrapper.text()).toContain('Transactions importées')
    expect(wrapper.text()).toContain('12') // categories
    expect(wrapper.text()).toContain('Catégories')
    expect(wrapper.text()).toContain('5') // duplicates
    expect(wrapper.text()).toContain('Doublons ignorés')
    expect(wrapper.text()).toContain('50') // total
    expect(wrapper.text()).toContain('Total traité')
  })

  it('should display success icon', async () => {
    const router = createRouterWithQuery({
      imported: '10',
      duplicates: '0',
      total: '10',
      categories: '5',
    })

    await router.isReady()

    const wrapper = mount(ImportRecapPage, {
      global: {
        plugins: [router],
      },
    })

    // Check for success checkmark icon
    expect(wrapper.find('.bg-green-100').exists()).toBe(true)
    expect(wrapper.html()).toContain('M5 13l4 4L19 7') // checkmark path
  })

  it('should show info message when there are duplicates', async () => {
    const router = createRouterWithQuery({
      imported: '8',
      duplicates: '2',
      total: '10',
      categories: '5',
    })

    await router.isReady()

    const wrapper = mount(ImportRecapPage, {
      global: {
        plugins: [router],
      },
    })

    expect(wrapper.text()).toContain('2 transactions en doublon')
    expect(wrapper.text()).toContain('automatiquement ignorées')
  })

  it('should not show info message when there are no duplicates', async () => {
    const router = createRouterWithQuery({
      imported: '10',
      duplicates: '0',
      total: '10',
      categories: '5',
    })

    await router.isReady()

    const wrapper = mount(ImportRecapPage, {
      global: {
        plugins: [router],
      },
    })

    expect(wrapper.text()).not.toContain('transactions en doublon')
  })

  it('should have navigation buttons', async () => {
    const router = createRouterWithQuery({
      imported: '10',
      duplicates: '0',
      total: '10',
      categories: '5',
    })

    await router.isReady()

    const wrapper = mount(ImportRecapPage, {
      global: {
        plugins: [router],
      },
    })

    expect(wrapper.text()).toContain('Nouvel import')
    expect(wrapper.text()).toContain('Retour au profil')
  })

  it('should navigate to import page when clicking "Nouvel import"', async () => {
    const router = createRouterWithQuery({
      imported: '10',
      duplicates: '0',
      total: '10',
      categories: '5',
    })

    await router.isReady()
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(ImportRecapPage, {
      global: {
        plugins: [router],
      },
    })

    const newImportButton = wrapper
      .findAll('button')
      .find(b => b.text().includes('Nouvel import'))
    await newImportButton!.trigger('click')

    expect(pushSpy).toHaveBeenCalledWith({ name: 'import' })
  })

  it('should navigate to profile page when clicking "Retour au profil"', async () => {
    const router = createRouterWithQuery({
      imported: '10',
      duplicates: '0',
      total: '10',
      categories: '5',
    })

    await router.isReady()
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(ImportRecapPage, {
      global: {
        plugins: [router],
      },
    })

    const profileButton = wrapper
      .findAll('button')
      .find(b => b.text().includes('Retour au profil'))
    await profileButton!.trigger('click')

    expect(pushSpy).toHaveBeenCalledWith({ name: 'profile' })
  })

  it('should handle missing query parameters gracefully', async () => {
    const router = createRouterWithQuery({})

    await router.isReady()

    const wrapper = mount(ImportRecapPage, {
      global: {
        plugins: [router],
      },
    })

    // Should display 0 for all values
    expect(wrapper.text()).toContain('0')
    expect(wrapper.text()).toContain('Import terminé')
  })

  it('should use correct color styling for stats', async () => {
    const router = createRouterWithQuery({
      imported: '10',
      duplicates: '5',
      total: '15',
      categories: '3',
    })

    await router.isReady()

    const wrapper = mount(ImportRecapPage, {
      global: {
        plugins: [router],
      },
    })

    // Check color classes
    expect(wrapper.find('.bg-green-50').exists()).toBe(true) // imported
    expect(wrapper.find('.bg-indigo-50').exists()).toBe(true) // categories
    expect(wrapper.find('.bg-amber-50').exists()).toBe(true) // duplicates
  })
})
