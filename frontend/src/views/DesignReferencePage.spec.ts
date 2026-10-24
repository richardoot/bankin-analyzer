import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import DesignReferencePage from './DesignReferencePage.vue'

enableAutoUnmount(afterEach)

async function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/design')
  const wrapper = mount(DesignReferencePage, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('DesignReferencePage — the dashboard', () => {
  it('states the rule of the state tints, with its three badges and the data hue', async () => {
    const wrapper = await mountPage()
    const tints = wrapper.get('[data-testid="design-state-tints"]')

    expect(tints.text()).toContain("Teintes d'état")
    expect(tints.html()).toContain('bg-teal-50')
    expect(tints.html()).toContain('bg-amber-50')
    expect(tints.html()).toContain('bg-gray-100')
    expect(tints.text()).toContain('jamais de rouge')
    // The three natures of a figure, beside the three states.
    const natures = tints.get('[data-testid="design-nature-hues"]')
    expect(natures.html()).toContain('text-blue-700')
    expect(natures.html()).toContain('text-green-700')
    expect(natures.html()).toContain('text-violet-700')
  })

  it('mounts the four bricks of the page', async () => {
    const wrapper = await mountPage()
    const section = wrapper.get('[data-testid="design-dashboard"]')

    for (const id of [
      'month-band',
      'todo-card',
      'structure-lines',
      'summary-line-income',
      'summary-line-events',
      'summary-line-episodes',
    ]) {
      expect(section.find(`[data-testid="${id}"]`).exists(), id).toBe(true)
    }
  })

  it('walks the month band through its states', async () => {
    const wrapper = await mountPage()
    const section = wrapper.get('[data-testid="design-dashboard"]')
    const pick = async (label: string) => {
      const option = section
        .findAll('[role="radio"]')
        .find(o => o.text().includes(label))
      expect(option, label).toBeDefined()
      await option?.trigger('click')
      await flushPromises()
    }
    const spentTone = () =>
      section.get('[data-testid="month-badge-spent"]').attributes('data-tone')

    expect(spentTone()).toBe('under')

    await pick('Au-dessus')
    expect(spentTone()).toBe('over')
    // Past what the income leaves: « dépassé », never in red.
    expect(
      section.get('[data-testid="month-tile-remaining"]').text()
    ).toContain('dépassé')

    await pick('Neutre')
    expect(spentTone()).toBe('neutral')

    await pick('Historique court')
    expect(section.get('[data-testid="month-badge-spent"]').text()).toBe(
      "pas encore d'habitude"
    )

    await pick('Erreur')
    expect(section.find('[data-testid="month-error"]').exists()).toBe(true)
    expect(section.find('[data-testid="month-tile-spent"]').exists()).toBe(
      false
    )
    // Never red; green only marks an income's figure, never a state.
    expect(section.html()).not.toMatch(/\btext-red-\d/)
    expect(section.html()).not.toMatch(/\bbg-green-\d/)
  })
})

describe('DesignReferencePage — the budget', () => {
  it('shows the plan’s bands and folded lines, in the state tints', async () => {
    const wrapper = await mountPage()
    const section = wrapper.get('[data-testid="design-budget"]')

    for (const id of [
      'budget-month-band',
      'budget-planning-band',
      'budget-review-band',
      'budget-projects-line',
      'budget-amortized-line',
    ]) {
      expect(section.find(`[data-testid="${id}"]`).exists(), id).toBe(true)
    }
    expect(section.text()).toContain('Les teintes d’état valent pour le budget')
    expect(section.html()).not.toMatch(/(?:text|bg)-red-\d/)
    // The only green: the reference income's figure, by its nature.
    expect(section.html()).not.toMatch(/\bbg-green-\d/)
    expect(
      section.get('[data-testid="budget-reference-income-input"]').classes()
    ).toContain('text-green-700')
  })

  it('lets « Mois lu » read another month', async () => {
    const wrapper = await mountPage()
    const band = wrapper.get('[data-testid="budget-month-band"]')
    await band.get('[data-testid="budget-month-2026-08"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="budget-month-title"]').text()).toBe(
      'Août'
    )
  })

  it('no longer says the plan’s figures are primary', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).not.toContain('Sur Budget, les chiffres du plan')
  })
})
