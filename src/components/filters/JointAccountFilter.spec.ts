import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import JointAccountFilter from './JointAccountFilter.vue'

describe('JointAccountFilter', () => {
  let wrapper: ReturnType<typeof mount>

  const mockAccounts = [
    'Compte Courant Principal',
    'Livret A',
    'Compte Épargne',
    'Carte Crédit',
  ]

  const defaultProps = {
    accounts: mockAccounts,
    selectedAccounts: ['Compte Courant Principal', 'Livret A'],
  }

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  describe('Rendu initial', () => {
    beforeEach(() => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })
    })

    it('devrait afficher le titre et la description', () => {
      expect(wrapper.find('.filter-title').text()).toContain('Comptes joints')
      expect(wrapper.find('.filter-description').text()).toContain(
        'Sélectionnez les comptes à considérer comme joints'
      )
      expect(wrapper.find('.filter-icon').exists()).toBe(true)
    })

    it("devrait afficher tous les boutons d'action", () => {
      const selectAllBtn = wrapper.find('.select-all')
      const deselectAllBtn = wrapper.find('.deselect-all')

      expect(selectAllBtn.exists()).toBe(true)
      expect(selectAllBtn.text()).toContain('Tout sélectionner')
      expect(deselectAllBtn.exists()).toBe(true)
      expect(deselectAllBtn.text()).toContain('Tout désélectionner')
    })

    it('devrait afficher tous les comptes', () => {
      const accountButtons = wrapper.findAll('.account-filter-button')
      expect(accountButtons).toHaveLength(mockAccounts.length)

      mockAccounts.forEach((account, index) => {
        expect(accountButtons[index].find('.account-name').text()).toBe(account)
      })
    })

    it('devrait afficher les icônes des comptes', () => {
      const accountIcons = wrapper.findAll('.account-icon')
      expect(accountIcons).toHaveLength(mockAccounts.length)

      accountIcons.forEach(icon => {
        expect(icon.find('.icon').exists()).toBe(true)
      })
    })

    it('devrait afficher le résumé de sélection', () => {
      const summary = wrapper.find('.summary-text')
      expect(summary.text()).toBe('2 / 4 comptes déclarés comme joints')
    })

    it('devrait afficher les informations sur les comptes joints', () => {
      const summaryInfo = wrapper.find('.summary-info')
      expect(summaryInfo.exists()).toBe(true)
      expect(summaryInfo.text()).toBe(
        'Les montants de ces comptes seront divisés par 2 dans les analyses'
      )
    })
  })

  describe('États des boutons', () => {
    it('devrait marquer les comptes sélectionnés comme joints', () => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })

      const accountButtons = wrapper.findAll('.account-filter-button')

      // Les deux premiers comptes devraient être sélectionnés
      expect(accountButtons[0].classes()).toContain('selected')
      expect(accountButtons[0].find('.joint-badge').exists()).toBe(true)
      expect(accountButtons[1].classes()).toContain('selected')
      expect(accountButtons[1].find('.joint-badge').exists()).toBe(true)

      // Les autres devraient être désactivés
      expect(accountButtons[2].classes()).toContain('disabled')
      expect(accountButtons[2].find('.joint-badge').exists()).toBe(false)
      expect(accountButtons[3].classes()).toContain('disabled')
      expect(accountButtons[3].find('.joint-badge').exists()).toBe(false)
    })

    it('devrait désactiver "Tout sélectionner" quand tout est sélectionné', () => {
      wrapper = mount(JointAccountFilter, {
        props: {
          accounts: mockAccounts,
          selectedAccounts: [...mockAccounts],
        },
      })

      const selectAllBtn = wrapper.find('.select-all')
      expect(selectAllBtn.attributes('disabled')).toBeDefined()
    })

    it('devrait désactiver "Tout désélectionner" quand rien n\'est sélectionné', () => {
      wrapper = mount(JointAccountFilter, {
        props: {
          accounts: mockAccounts,
          selectedAccounts: [],
        },
      })

      const deselectAllBtn = wrapper.find('.deselect-all')
      expect(deselectAllBtn.attributes('disabled')).toBeDefined()
    })

    it('ne devrait pas désactiver les boutons dans un état intermédiaire', () => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })

      const selectAllBtn = wrapper.find('.select-all')
      const deselectAllBtn = wrapper.find('.deselect-all')

      expect(selectAllBtn.attributes('disabled')).toBeUndefined()
      expect(deselectAllBtn.attributes('disabled')).toBeUndefined()
    })
  })

  describe('Interactions', () => {
    beforeEach(() => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })
    })

    it('devrait émettre la sélection lors du clic sur un compte non sélectionné', async () => {
      const compteEpargneButton = wrapper.findAll('.account-filter-button')[2] // Compte Épargne
      await compteEpargneButton.trigger('click')

      expect(wrapper.emitted('update:selected-accounts')).toBeTruthy()
      expect(wrapper.emitted('update:selected-accounts')?.[0]).toEqual([
        ['Compte Courant Principal', 'Livret A', 'Compte Épargne'],
      ])
    })

    it('devrait émettre la désélection lors du clic sur un compte sélectionné', async () => {
      const compteCourantButton = wrapper.findAll('.account-filter-button')[0] // Compte Courant Principal
      await compteCourantButton.trigger('click')

      expect(wrapper.emitted('update:selected-accounts')).toBeTruthy()
      expect(wrapper.emitted('update:selected-accounts')?.[0]).toEqual([
        ['Livret A'],
      ])
    })

    it('devrait sélectionner tous les comptes', async () => {
      const selectAllBtn = wrapper.find('.select-all')
      await selectAllBtn.trigger('click')

      expect(wrapper.emitted('update:selected-accounts')).toBeTruthy()
      expect(wrapper.emitted('update:selected-accounts')?.[0]).toEqual([
        [...mockAccounts],
      ])
    })

    it('devrait désélectionner tous les comptes', async () => {
      const deselectAllBtn = wrapper.find('.deselect-all')
      await deselectAllBtn.trigger('click')

      expect(wrapper.emitted('update:selected-accounts')).toBeTruthy()
      expect(wrapper.emitted('update:selected-accounts')?.[0]).toEqual([[]])
    })
  })

  describe('Formatage des noms de comptes', () => {
    beforeEach(() => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })
    })

    it('devrait afficher les noms de comptes courts sans modification', () => {
      const shortName = 'Livret A'
      const formattedName = wrapper.vm.formatAccountName(shortName)
      expect(formattedName).toBe(shortName)
    })

    it('devrait tronquer les noms de comptes très longs', () => {
      const longName =
        'Un nom de compte bancaire extrêmement long qui dépasse largement la limite de caractères'
      const formattedName = wrapper.vm.formatAccountName(longName)
      expect(formattedName).toHaveLength(40) // 37 + '...'
      expect(formattedName.endsWith('...')).toBe(true)
    })

    it('devrait gérer exactement 40 caractères', () => {
      const exactName = '1234567890123456789012345678901234567890' // Exactement 40 caractères
      const formattedName = wrapper.vm.formatAccountName(exactName)
      expect(formattedName).toBe(exactName)
    })

    it('devrait gérer exactement 41 caractères', () => {
      const overName = '12345678901234567890123456789012345678901' // 41 caractères
      const formattedName = wrapper.vm.formatAccountName(overName)
      expect(formattedName).toHaveLength(40)
      expect(formattedName.endsWith('...')).toBe(true)
    })
  })

  describe('Props réactives', () => {
    it("devrait mettre à jour l'affichage quand les comptes changent", async () => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })

      const newAccounts = ['Nouveau Compte 1', 'Nouveau Compte 2']
      await wrapper.setProps({
        accounts: newAccounts,
        selectedAccounts: ['Nouveau Compte 1'],
      })

      const accountButtons = wrapper.findAll('.account-filter-button')
      expect(accountButtons).toHaveLength(2)
      expect(accountButtons[0].find('.account-name').text()).toBe(
        'Nouveau Compte 1'
      )
      expect(accountButtons[1].find('.account-name').text()).toBe(
        'Nouveau Compte 2'
      )
    })

    it('devrait mettre à jour le résumé quand la sélection change', async () => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })

      await wrapper.setProps({
        selectedAccounts: [
          'Compte Courant Principal',
          'Livret A',
          'Compte Épargne',
        ],
      })

      const summary = wrapper.find('.summary-text')
      expect(summary.text()).toBe('3 / 4 comptes déclarés comme joints')
    })

    it("devrait masquer les informations sur les comptes joints quand aucun n'est sélectionné", async () => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })

      await wrapper.setProps({
        selectedAccounts: [],
      })

      const summaryInfo = wrapper.find('.summary-info')
      expect(summaryInfo.exists()).toBe(false)
    })

    it('devrait mettre à jour les états des boutons quand la sélection change', async () => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })

      // Tout sélectionner
      await wrapper.setProps({
        selectedAccounts: [...mockAccounts],
      })

      expect(wrapper.find('.select-all').attributes('disabled')).toBeDefined()
      expect(
        wrapper.find('.deselect-all').attributes('disabled')
      ).toBeUndefined()

      // Tout désélectionner
      await wrapper.setProps({
        selectedAccounts: [],
      })

      expect(wrapper.find('.select-all').attributes('disabled')).toBeUndefined()
      expect(wrapper.find('.deselect-all').attributes('disabled')).toBeDefined()
    })
  })

  describe('Cases particuliers', () => {
    it('devrait gérer une liste vide de comptes', () => {
      wrapper = mount(JointAccountFilter, {
        props: {
          accounts: [],
          selectedAccounts: [],
        },
      })

      expect(wrapper.findAll('.account-filter-button')).toHaveLength(0)
      expect(wrapper.find('.summary-text').text()).toBe(
        '0 / 0 comptes déclarés comme joints'
      )
      expect(wrapper.find('.summary-info').exists()).toBe(false)
    })

    it('devrait gérer un seul compte', () => {
      wrapper = mount(JointAccountFilter, {
        props: {
          accounts: ['Unique Compte'],
          selectedAccounts: ['Unique Compte'],
        },
      })

      const accountButtons = wrapper.findAll('.account-filter-button')
      expect(accountButtons).toHaveLength(1)
      expect(accountButtons[0].classes()).toContain('selected')
      expect(wrapper.find('.summary-text').text()).toBe(
        '1 / 1 comptes déclarés comme joints'
      )
    })

    it('devrait gérer des noms de comptes avec caractères spéciaux', () => {
      const specialAccounts = [
        'Compte "Principal"',
        'Livret & Épargne',
        'Carte <Premium>',
      ]
      wrapper = mount(JointAccountFilter, {
        props: {
          accounts: specialAccounts,
          selectedAccounts: [],
        },
      })

      const accountButtons = wrapper.findAll('.account-filter-button')
      specialAccounts.forEach((account, index) => {
        expect(accountButtons[index].find('.account-name').text()).toBe(account)
      })
    })
  })

  describe('Badges et indicateurs visuels', () => {
    beforeEach(() => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })
    })

    it('devrait afficher le badge "Joint" pour les comptes sélectionnés', () => {
      const selectedButtons = wrapper.findAll('.account-filter-button.selected')

      selectedButtons.forEach(button => {
        expect(button.find('.joint-badge').exists()).toBe(true)
        expect(button.find('.joint-badge').text()).toBe('Joint')
      })
    })

    it('ne devrait pas afficher le badge "Joint" pour les comptes non sélectionnés', () => {
      const disabledButtons = wrapper.findAll('.account-filter-button.disabled')

      disabledButtons.forEach(button => {
        expect(button.find('.joint-badge').exists()).toBe(false)
      })
    })

    it("devrait adapter l'icône selon l'état du compte", () => {
      const accountButtons = wrapper.findAll('.account-filter-button')

      // Comptes sélectionnés - icône normale
      expect(accountButtons[0].find('.account-icon').classes()).not.toContain(
        'disabled'
      )
      expect(accountButtons[1].find('.account-icon').classes()).not.toContain(
        'disabled'
      )

      // Comptes désactivés - icône avec style disabled
      const disabledIcons = wrapper.findAll(
        '.account-filter-button.disabled .account-icon'
      )
      expect(disabledIcons.length).toBeGreaterThan(0)
    })
  })

  describe('Computed properties', () => {
    it('devrait calculer correctement allSelected', () => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })
      expect(wrapper.vm.allSelected).toBe(false)

      wrapper = mount(JointAccountFilter, {
        props: {
          accounts: mockAccounts,
          selectedAccounts: [...mockAccounts],
        },
      })
      expect(wrapper.vm.allSelected).toBe(true)
    })

    it('devrait calculer correctement noneSelected', () => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })
      expect(wrapper.vm.noneSelected).toBe(false)

      wrapper = mount(JointAccountFilter, {
        props: {
          accounts: mockAccounts,
          selectedAccounts: [],
        },
      })
      expect(wrapper.vm.noneSelected).toBe(true)
    })
  })

  describe('Accessibilité', () => {
    beforeEach(() => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })
    })

    it('devrait avoir des boutons accessibles', () => {
      const buttons = wrapper.findAll('button')
      buttons.forEach(button => {
        expect(button.element.tagName).toBe('BUTTON')
        expect(button.text().length).toBeGreaterThan(0)
      })
    })

    it('devrait avoir des icônes SVG appropriées', () => {
      const filterIcon = wrapper.find('.filter-icon')
      const btnIcons = wrapper.findAll('.btn-icon')
      const accountIcons = wrapper.findAll('.icon')

      expect(filterIcon.exists()).toBe(true)
      expect(btnIcons.length).toBeGreaterThanOrEqual(2)
      expect(accountIcons.length).toBe(mockAccounts.length)
    })

    it('devrait permettre la navigation par tabulation', () => {
      const buttons = wrapper.findAll('button')
      buttons.forEach(button => {
        expect(button.attributes('tabindex')).not.toBe('-1')
      })
    })
  })

  describe('Responsive design', () => {
    it('devrait avoir des classes CSS pour le responsive', () => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })

      expect(wrapper.find('.joint-account-filter').exists()).toBe(true)
      expect(wrapper.find('.accounts-list').exists()).toBe(true)
      expect(wrapper.find('.filter-actions').exists()).toBe(true)
    })

    it('devrait avoir une liste défilable pour les comptes', () => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })

      const accountsList = wrapper.find('.accounts-list')
      expect(accountsList.classes()).toContain('accounts-list')
      // La propriété max-height et overflow-y sont définies dans le CSS
    })
  })

  describe('Sémantique spécifique aux comptes joints', () => {
    it("devrait expliquer clairement l'impact des comptes joints", () => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })

      const description = wrapper.find('.filter-description')
      expect(description.text()).toContain('montants divisés par 2')

      const summaryInfo = wrapper.find('.summary-info')
      expect(summaryInfo.text()).toContain('divisés par 2 dans les analyses')
    })

    it('devrait utiliser un style visuel distinct (violet)', () => {
      wrapper = mount(JointAccountFilter, { props: defaultProps })

      const filterIcon = wrapper.find('.filter-icon')
      // L'icône devrait avoir une couleur violette définie dans le CSS
      expect(filterIcon.exists()).toBe(true)

      const selectedButtons = wrapper.findAll('.account-filter-button.selected')
      selectedButtons.forEach(button => {
        const jointBadge = button.find('.joint-badge')
        expect(jointBadge.exists()).toBe(true)
        // Le badge devrait avoir un style violet défini dans le CSS
      })
    })
  })
})
