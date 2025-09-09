import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PersonsManager from './PersonsManager.vue'
import BaseModal from './BaseModal.vue'
import BaseButton from './BaseButton.vue'
import BaseCard from './BaseCard.vue'

// Mock the useLocalStorage composable with reactive ref
import { ref } from 'vue'

const mockPersonsData = ref([
  { id: '1', name: 'John Doe', email: 'john@example.com' },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
  { id: '3', name: 'Bob Wilson' },
])

const mockUsePersonsStorage = {
  data: mockPersonsData,
  save: vi.fn(),
}

vi.mock('@/composables/useLocalStorage', () => ({
  useLocalStorage: () => ({
    usePersonsStorage: () => mockUsePersonsStorage,
  }),
}))

// Mock localStorage for cleanup functions
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock confirm dialog
Object.defineProperty(window, 'confirm', { value: vi.fn(() => true) })

// Mock alert dialog
Object.defineProperty(window, 'alert', { value: vi.fn() })

describe('PersonsManager', () => {
  let wrapper: ReturnType<typeof mount>

  const mockPersons = [
    { id: '1', name: 'John Doe', email: 'john@example.com' },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
    { id: '3', name: 'Bob Wilson' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock data
    mockPersonsData.value = [...mockPersons]
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockPersons))
  })

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  describe('Rendu initial', () => {
    it('devrait afficher le titre de section', () => {
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })

      expect(wrapper.find('.section-title').text()).toContain(
        'Gestion des personnes'
      )
      expect(wrapper.find('.section-title svg').exists()).toBe(true)
    })

    it('devrait charger les personnes depuis usePersonsStorage', () => {
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })

      expect(wrapper.findAll('.person-item')).toHaveLength(3)
    })

    it('devrait gérer la liste vide', () => {
      mockPersonsData.value = []
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })

      expect(wrapper.find('.no-results').exists()).toBe(true)
      expect(wrapper.find('.no-results p').text()).toContain(
        'Aucune personne enregistrée'
      )
    })

    it('devrait gérer les données invalides', () => {
      mockPersonsData.value = []
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })

      expect(wrapper.find('.no-results').exists()).toBe(true)
    })
  })

  describe('Affichage des personnes', () => {
    beforeEach(() => {
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })
    })

    it('devrait afficher les informations de chaque personne', () => {
      const personItems = wrapper.findAll('.person-item')

      expect(personItems[0].find('.person-name').text()).toBe('John Doe')
      expect(personItems[0].find('.person-email').text()).toBe(
        'john@example.com'
      )
      expect(personItems[0].find('.person-avatar').text()).toBe('J')

      expect(personItems[2].find('.person-name').text()).toBe('Bob Wilson')
      expect(personItems[2].find('.person-email').text()).toContain(
        'Aucun email renseigné'
      )
    })

    it('devrait afficher le compteur de personnes', () => {
      const personsCount = wrapper.find('.persons-count')
      expect(personsCount.text()).toContain('3 / 3 personnes')
    })

    it('devrait utiliser le singulier pour une personne', () => {
      mockPersonsData.value = [mockPersons[0]]
      wrapper = mount(PersonsManager)

      const personsCount = wrapper.find('.persons-count')
      expect(personsCount.text()).toContain('1 / 1 personne')
    })

    it("devrait afficher les boutons d'action pour chaque personne", () => {
      const firstPersonActions = wrapper
        .findAll('.person-item')[0]
        .findAll('.action-btn')

      expect(firstPersonActions).toHaveLength(2)
      expect(firstPersonActions[0].attributes('title')).toBe('Éditer')
      expect(firstPersonActions[1].attributes('title')).toBe('Supprimer')
    })
  })

  describe('Barre de recherche', () => {
    beforeEach(() => {
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })
    })

    it('devrait afficher la barre de recherche', () => {
      expect(wrapper.find('.search-input').exists()).toBe(true)
      expect(wrapper.find('.search-icon').exists()).toBe(true)
    })

    it('devrait filtrer par nom', async () => {
      const searchInput = wrapper.find('.search-input')
      await searchInput.setValue('John')

      const visiblePersons = wrapper.findAll('.person-item')
      expect(visiblePersons).toHaveLength(1)
      expect(visiblePersons[0].find('.person-name').text()).toBe('John Doe')
    })

    it('devrait filtrer par email', async () => {
      const searchInput = wrapper.find('.search-input')
      await searchInput.setValue('jane@example.com')

      const visiblePersons = wrapper.findAll('.person-item')
      expect(visiblePersons).toHaveLength(1)
      expect(visiblePersons[0].find('.person-name').text()).toBe('Jane Smith')
    })

    it('devrait être insensible à la casse', async () => {
      const searchInput = wrapper.find('.search-input')
      await searchInput.setValue('JOHN')

      const visiblePersons = wrapper.findAll('.person-item')
      expect(visiblePersons).toHaveLength(1)
      expect(visiblePersons[0].find('.person-name').text()).toBe('John Doe')
    })

    it('devrait afficher le bouton clear quand il y a du texte', async () => {
      const searchInput = wrapper.find('.search-input')
      await searchInput.setValue('test')

      expect(wrapper.find('.clear-search').exists()).toBe(true)
    })

    it('devrait effacer la recherche lors du clic sur clear', async () => {
      const searchInput = wrapper.find('.search-input')
      await searchInput.setValue('test')

      const clearButton = wrapper.find('.clear-search')
      await clearButton.trigger('click')

      expect(searchInput.element.value).toBe('')
    })

    it('devrait afficher un message quand aucun résultat', async () => {
      const searchInput = wrapper.find('.search-input')
      await searchInput.setValue('inexistant')

      expect(wrapper.find('.no-results').exists()).toBe(true)
      expect(wrapper.find('.no-results p').text()).toContain(
        'Aucune personne trouvée pour "inexistant"'
      )
    })

    it('devrait mettre à jour le compteur avec la recherche', async () => {
      const searchInput = wrapper.find('.search-input')
      await searchInput.setValue('John')

      const personsCount = wrapper.find('.persons-count')
      expect(personsCount.text()).toMatch(/1 \/ 3 personne\s+trouvée/)
    })
  })

  describe('Ajout de personne', () => {
    beforeEach(() => {
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })
    })

    it("devrait afficher le bouton d'ajout", () => {
      const addButton = wrapper.findComponent(BaseButton)
      expect(addButton.exists()).toBe(true)
      expect(addButton.text()).toContain('Ajouter une personne')
    })

    it("devrait ouvrir le formulaire d'ajout", async () => {
      const addButton = wrapper.findComponent(BaseButton)
      await addButton.trigger('click')

      const modal = wrapper.findComponent(BaseModal)
      expect(modal.props('isOpen')).toBe(true)
      expect(modal.props('title')).toBe('Ajouter une nouvelle personne')
    })

    it('devrait valider le formulaire correctement', async () => {
      const addButton = wrapper.findComponent(BaseButton)
      await addButton.trigger('click')

      const nameInput = wrapper.find('#person-name')
      const emailInput = wrapper.find('#person-email')

      // Need to wait for modal to fully render
      await wrapper.vm.$nextTick()

      const modal = wrapper.findComponent(BaseModal)
      const submitButtons = modal.findAllComponents(BaseButton)
      const submitButton = submitButtons.find(btn =>
        btn.text().includes('Ajouter')
      )

      // Formulaire vide - invalide
      expect(submitButton?.props('disabled')).toBe(true)

      // Nom seul - valide
      await nameInput.setValue('New Person')
      await wrapper.vm.$nextTick()
      expect(submitButton?.props('disabled')).toBe(false)

      // Email invalide - invalide
      await emailInput.setValue('invalid-email')
      await wrapper.vm.$nextTick()
      expect(submitButton?.props('disabled')).toBe(true)
      expect(wrapper.find('.error-message').text()).toContain(
        'adresse email valide'
      )

      // Email valide - valide
      await emailInput.setValue('new@example.com')
      await wrapper.vm.$nextTick()
      expect(submitButton?.props('disabled')).toBe(false)
    })

    it('devrait détecter les emails dupliqués', async () => {
      const addButton = wrapper.find('.add-person-btn')
      await addButton.trigger('click')

      const nameInput = wrapper.find('#person-name')
      const emailInput = wrapper.find('#person-email')

      await nameInput.setValue('New Person')
      await emailInput.setValue('john@example.com') // Email déjà existant
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.error-message').text()).toContain('déjà utilisée')
    })

    it('devrait ajouter une nouvelle personne', async () => {
      const addButton = wrapper.findComponent(BaseButton)
      await addButton.trigger('click')

      const nameInput = wrapper.find('#person-name')
      const emailInput = wrapper.find('#person-email')
      const form = wrapper.find('form')

      await nameInput.setValue('New Person')
      await emailInput.setValue('new@example.com')
      await form.trigger('submit')

      expect(mockUsePersonsStorage.save).toHaveBeenCalled()
      const modal = wrapper.findComponent(BaseModal)
      expect(modal.props('isOpen')).toBe(false)
    })

    it('devrait ajouter une personne sans email', async () => {
      const addButton = wrapper.findComponent(BaseButton)
      await addButton.trigger('click')

      const nameInput = wrapper.find('#person-name')
      const form = wrapper.find('form')

      await nameInput.setValue('Person Without Email')
      await form.trigger('submit')

      expect(mockUsePersonsStorage.save).toHaveBeenCalled()
    })
  })

  describe('Édition de personne', () => {
    beforeEach(() => {
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })
    })

    it("devrait ouvrir le formulaire d'édition", async () => {
      const editButton = wrapper.findAll('.action-btn.edit')[0]
      await editButton.trigger('click')

      const modal = wrapper.findComponent(BaseModal)
      expect(modal.props('isOpen')).toBe(true)
      expect(modal.props('title')).toBe('Modifier la personne')
      expect(wrapper.find('#person-name').element.value).toBe('John Doe')
      expect(wrapper.find('#person-email').element.value).toBe(
        'john@example.com'
      )
    })

    it("devrait changer le texte du bouton d'ajout en mode édition", async () => {
      const editButton = wrapper.findAll('.action-btn.edit')[0]
      await editButton.trigger('click')

      const addButton = wrapper.findComponent(BaseButton)
      expect(addButton.text()).toContain('Annuler')
    })

    it('devrait mettre à jour une personne', async () => {
      const editButton = wrapper.findAll('.action-btn.edit')[0]
      await editButton.trigger('click')

      const nameInput = wrapper.find('#person-name')
      const form = wrapper.find('form')

      await nameInput.setValue('John Updated')
      await form.trigger('submit')

      expect(mockUsePersonsStorage.save).toHaveBeenCalled()
    })

    it("ne devrait pas considérer l'email de la personne éditée comme doublon", async () => {
      const editButton = wrapper.findAll('.action-btn.edit')[0]
      await editButton.trigger('click')

      // L'email de John ne devrait pas être considéré comme un doublon pour John lui-même
      const submitButtons = wrapper.findAllComponents(BaseButton)
      const submitButton = submitButtons.find(btn =>
        btn.text().includes('Sauvegarder')
      )
      expect(submitButton?.props('disabled')).toBe(false)
    })
  })

  describe('Suppression de personne', () => {
    beforeEach(() => {
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })
    })

    it('devrait demander confirmation avant suppression', async () => {
      const deleteButton = wrapper.findAll('.action-btn.delete')[0]
      await deleteButton.trigger('click')

      expect(window.confirm).toHaveBeenCalledWith(
        'Êtes-vous sûr de vouloir supprimer cette personne ?'
      )
    })

    it('devrait supprimer une personne', async () => {
      const deleteButton = wrapper.findAll('.action-btn.delete')[0]
      await deleteButton.trigger('click')

      expect(mockUsePersonsStorage.save).toHaveBeenCalled()
    })

    it('ne devrait pas supprimer si confirmation annulée', async () => {
      vi.mocked(window.confirm).mockReturnValueOnce(false)

      const deleteButton = wrapper.findAll('.action-btn.delete')[0]
      await deleteButton.trigger('click')

      // save ne devrait pas être appelé pour la suppression
      expect(mockUsePersonsStorage.save).not.toHaveBeenCalled()
    })

    it('devrait nettoyer les assignations de la personne supprimée', async () => {
      const mockAssignments = [
        {
          transactionId: 'tx1',
          assignedPersons: [
            { personId: '1', amount: 100 },
            { personId: '2', amount: 50 },
          ],
        },
      ]
      localStorageMock.getItem.mockImplementation(key => {
        if (key === 'bankin-analyzer-persons')
          return JSON.stringify(mockPersons)
        if (key === 'bankin-analyzer-expense-assignments')
          return JSON.stringify(mockAssignments)
        return null
      })

      const deleteButton = wrapper.findAll('.action-btn.delete')[0]
      await deleteButton.trigger('click')

      // Vérifier que les assignations ont été nettoyées
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'bankin-analyzer-expense-assignments',
        expect.stringContaining('"personId":"2"')
      )
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'bankin-analyzer-expense-assignments',
        expect.not.stringContaining('"personId":"1"')
      )
    })
  })

  describe('Gestion de la modale', () => {
    beforeEach(() => {
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })
    })

    it('devrait fermer la modale en cliquant sur overlay', async () => {
      const addButton = wrapper.findComponent(BaseButton)
      await addButton.trigger('click')

      const modal = wrapper.findComponent(BaseModal)
      await modal.find('.modal-overlay').trigger('click')

      expect(modal.props('isOpen')).toBe(false)
    })

    it('ne devrait pas fermer la modale en cliquant sur le contenu', async () => {
      const addButton = wrapper.findComponent(BaseButton)
      await addButton.trigger('click')

      const modal = wrapper.findComponent(BaseModal)
      await modal.find('.modal-content').trigger('click')

      expect(modal.props('isOpen')).toBe(true)
    })

    it('devrait fermer la modale avec le bouton de fermeture', async () => {
      const addButton = wrapper.findComponent(BaseButton)
      await addButton.trigger('click')

      const modal = wrapper.findComponent(BaseModal)
      const closeButton = modal.find('.modal-close-button')
      await closeButton.trigger('click')

      expect(modal.props('isOpen')).toBe(false)
    })

    it('devrait fermer la modale avec le bouton Annuler', async () => {
      const addButton = wrapper.findComponent(BaseButton)
      await addButton.trigger('click')

      const cancelButtons = wrapper.findAllComponents(BaseButton)
      const cancelButton = cancelButtons.find(btn =>
        btn.text().includes('Annuler')
      )
      await cancelButton?.trigger('click')

      const modal = wrapper.findComponent(BaseModal)
      expect(modal.props('isOpen')).toBe(false)
    })

    it('devrait réinitialiser le formulaire lors de la fermeture', async () => {
      const addButton = wrapper.findComponent(BaseButton)
      await addButton.trigger('click')

      const nameInput = wrapper.find('#person-name')
      await nameInput.setValue('Test')

      const modal = wrapper.findComponent(BaseModal)
      const closeButton = modal.find('.modal-close-button')
      await closeButton.trigger('click')

      // Rouvrir et vérifier que le formulaire est vide
      await addButton.trigger('click')
      expect(wrapper.find('#person-name').element.value).toBe('')
    })
  })

  describe('Export/Import', () => {
    beforeEach(() => {
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })
    })

    it("devrait afficher les boutons d'export/import quand il y a des personnes", () => {
      expect(wrapper.find('.secondary-actions').exists()).toBe(true)

      const buttons = wrapper.findAllComponents(BaseButton)
      const exportButton = buttons.find(btn => btn.text().includes('Exporter'))
      const importButton = buttons.find(btn => btn.text().includes('Importer'))

      expect(exportButton?.exists()).toBe(true)
      expect(importButton?.exists()).toBe(true)
    })

    it('ne devrait pas afficher les boutons export/import sans personnes', () => {
      mockPersonsData.value = []
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })

      expect(wrapper.find('.secondary-actions').exists()).toBe(false)
    })

    it("devrait créer un lien de téléchargement pour l'export", async () => {
      // Mock des APIs du navigateur
      const mockCreateElement = vi.spyOn(document, 'createElement')
      const mockAppendChild = vi
        .spyOn(document.body, 'appendChild')
        .mockImplementation(() => {})
      const mockRemoveChild = vi
        .spyOn(document.body, 'removeChild')
        .mockImplementation(() => {})
      const mockCreateObjectURL = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:url')
      const mockRevokeObjectURL = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => {})

      const mockClick = vi.fn()
      const mockLink = {
        href: '',
        download: '',
        click: mockClick,
      }
      mockCreateElement.mockReturnValue(mockLink as HTMLAnchorElement)

      const buttons = wrapper.findAllComponents(BaseButton)
      const exportButton = buttons.find(btn => btn.text().includes('Exporter'))
      await exportButton?.trigger('click')

      expect(mockCreateElement).toHaveBeenCalledWith('a')
      expect(mockLink.download).toBe('personnes-bankin-analyzer.json')
      expect(mockClick).toHaveBeenCalled()
      expect(mockRevokeObjectURL).toHaveBeenCalled()

      // Restore mocks
      mockCreateElement.mockRestore()
      mockAppendChild.mockRestore()
      mockRemoveChild.mockRestore()
      mockCreateObjectURL.mockRestore()
      mockRevokeObjectURL.mockRestore()
    })

    it("devrait traiter l'import de fichier valide", async () => {
      const importInput = wrapper.find('input[type="file"]')
      const newPersons = [
        { id: '4', name: 'Imported Person', email: 'imported@example.com' },
      ]

      // Mock FileReader
      const mockFileReader = {
        readAsText: vi.fn(),
        onload: null as ((event: ProgressEvent<FileReader>) => void) | null,
      }
      vi.spyOn(window, 'FileReader').mockImplementation(
        () => mockFileReader as unknown as FileReader
      )

      const file = new File([JSON.stringify(newPersons)], 'persons.json', {
        type: 'application/json',
      })

      // Simuler l'événement change
      Object.defineProperty(importInput.element, 'files', {
        value: [file],
        writable: false,
      })
      await importInput.trigger('change')

      // Simuler la lecture du fichier
      mockFileReader.onload({ target: { result: JSON.stringify(newPersons) } })

      expect(mockUsePersonsStorage.save).toHaveBeenCalled()
      expect(window.alert).toHaveBeenCalledWith(
        '1 personne(s) importée(s) avec succès'
      )
    })

    it("devrait gérer les erreurs d'import", async () => {
      const importInput = wrapper.find('input[type="file"]')

      const mockFileReader = {
        readAsText: vi.fn(),
        onload: null as ((event: ProgressEvent<FileReader>) => void) | null,
      }
      vi.spyOn(window, 'FileReader').mockImplementation(
        () => mockFileReader as unknown as FileReader
      )

      const file = new File(['invalid json'], 'persons.json', {
        type: 'application/json',
      })

      Object.defineProperty(importInput.element, 'files', {
        value: [file],
        writable: false,
      })
      await importInput.trigger('change')

      // Simuler l'erreur de parsing
      mockFileReader.onload({ target: { result: 'invalid json' } })

      expect(window.alert).toHaveBeenCalledWith(
        'Erreur lors de la lecture du fichier'
      )
    })

    it('devrait valider les données importées', async () => {
      const importInput = wrapper.find('input[type="file"]')

      const mockFileReader = {
        readAsText: vi.fn(),
        onload: null as ((event: ProgressEvent<FileReader>) => void) | null,
      }
      vi.spyOn(window, 'FileReader').mockImplementation(
        () => mockFileReader as unknown as FileReader
      )

      const invalidData = [
        { id: '1', name: 'Valid Person' },
        { name: 'Invalid - No ID' },
        { id: '2' }, // No name
        { id: '3', name: 'Person', email: 'invalid-email' },
      ]

      const file = new File([JSON.stringify(invalidData)], 'persons.json', {
        type: 'application/json',
      })

      Object.defineProperty(importInput.element, 'files', {
        value: [file],
        writable: false,
      })
      await importInput.trigger('change')

      mockFileReader.onload({ target: { result: JSON.stringify(invalidData) } })

      // Seule la première personne devrait être valide
      expect(window.alert).toHaveBeenCalledWith(
        '1 personne(s) importée(s) avec succès'
      )
    })
  })

  describe("Validation et génération d'ID", () => {
    beforeEach(() => {
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })
    })

    it('devrait générer des IDs uniques', () => {
      const id1 = wrapper.vm.generateId()
      const id2 = wrapper.vm.generateId()

      expect(id1).not.toBe(id2)
      expect(typeof id1).toBe('string')
      expect(id1.length).toBeGreaterThan(10)
    })

    it('devrait valider les emails correctement', () => {
      expect(wrapper.vm.isValidEmail('test@example.com')).toBe(true)
      expect(wrapper.vm.isValidEmail('user.name+tag@domain.co.uk')).toBe(true)
      expect(wrapper.vm.isValidEmail('invalid-email')).toBe(false)
      expect(wrapper.vm.isValidEmail('test@')).toBe(false)
      expect(wrapper.vm.isValidEmail('@domain.com')).toBe(false)
    })

    it("devrait détecter les doublons d'email", () => {
      expect(wrapper.vm.isEmailDuplicate('john@example.com')).toBe(true)
      expect(wrapper.vm.isEmailDuplicate('JOHN@EXAMPLE.COM')).toBe(true) // Case insensitive
      expect(wrapper.vm.isEmailDuplicate('new@example.com')).toBe(false)
      expect(wrapper.vm.isEmailDuplicate('')).toBe(false)
    })
  })

  describe('Accessibilité', () => {
    beforeEach(() => {
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })
    })

    it('devrait avoir des labels appropriés pour les inputs', async () => {
      const addButton = wrapper.find('.add-person-btn')
      await addButton.trigger('click')

      const nameInput = wrapper.find('#person-name')
      const emailInput = wrapper.find('#person-email')
      const nameLabel = wrapper.find('label[for="person-name"]')
      const emailLabel = wrapper.find('label[for="person-email"]')

      expect(nameInput.exists()).toBe(true)
      expect(emailInput.exists()).toBe(true)
      expect(nameLabel.exists()).toBe(true)
      expect(emailLabel.exists()).toBe(true)
    })

    it("devrait avoir des attributs title pour les boutons d'action", () => {
      const editButton = wrapper.find('.action-btn.edit')
      const deleteButton = wrapper.find('.action-btn.delete')

      expect(editButton.attributes('title')).toBe('Éditer')
      expect(deleteButton.attributes('title')).toBe('Supprimer')
    })

    it('devrait avoir un placeholder approprié pour la recherche', () => {
      const searchInput = wrapper.find('.search-input')
      expect(searchInput.attributes('placeholder')).toBe(
        'Rechercher par nom ou email...'
      )
    })
  })

  describe('Responsive design', () => {
    it('devrait avoir des classes CSS pour le responsive', () => {
      wrapper = mount(PersonsManager, {
        global: {
          components: {
            BaseModal,
            BaseButton,
            BaseCard,
          },
        },
      })

      expect(wrapper.findComponent(BaseCard).exists()).toBe(true)
      expect(wrapper.find('.section-content').exists()).toBe(true)
      expect(wrapper.find('.persons-list').exists()).toBe(true)
      expect(wrapper.find('.action-buttons').exists()).toBe(true)
    })
  })
})
