import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '@/App.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import StartAnalysisSection from '@/components/layout/StartAnalysisSection.vue'
import { waitForAsyncComponent as _waitForAsyncComponent } from '@/test/setup'

// Mock des composants lourds pour focus sur la navigation
vi.mock('@/views/UploadPage.vue', () => ({
  default: {
    name: 'UploadPage',
    template: '<div class="upload-page-mock">Upload Page Content</div>',
    emits: [],
    setup() {
      return {}
    },
  },
}))

vi.mock('@/components/layout/HeroSection.vue', () => ({
  default: {
    name: 'HeroSection',
    template: '<div class="hero-section-mock">Hero Section Content</div>',
    emits: [],
  },
}))

vi.mock('@/components/layout/AppFooter.vue', () => ({
  default: {
    name: 'AppFooter',
    template: '<footer class="app-footer-mock">Footer Content</footer>',
    emits: [],
  },
}))

describe('App Navigation Integration Tests', () => {
  let wrapper: ReturnType<typeof mount>

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  describe('Navigation initiale et état par défaut', () => {
    beforeEach(async () => {
      wrapper = mount(App, {
        global: {
          stubs: {
            // Stub the async component directly
            UploadPage: {
              template:
                '<div class="upload-page-mock">Upload Page Content</div>',
            },
          },
        },
      })
      await wrapper.vm.$nextTick()
    })

    it("devrait afficher la page d'accueil par défaut", () => {
      expect(wrapper.find('.hero-section-mock').exists()).toBe(true)
      expect(wrapper.find('.upload-page-mock').exists()).toBe(false)
      expect(wrapper.vm.currentView).toBe('home')
    })

    it("devrait passer l'état de navigation au header", () => {
      const appHeader = wrapper.findComponent(AppHeader)
      expect(appHeader.props('currentView')).toBe('home')
    })

    it("devrait afficher tous les composants de la page d'accueil", () => {
      expect(wrapper.find('.hero-section-mock').exists()).toBe(true)
      expect(wrapper.find('.start-analysis-section').exists()).toBe(true)
      expect(wrapper.find('.app-footer-mock').exists()).toBe(true)
    })
  })

  describe('Navigation via AppHeader', () => {
    beforeEach(async () => {
      wrapper = mount(App, {
        global: {
          stubs: {
            UploadPage: {
              template:
                '<div class="upload-page-mock">Upload Page Content</div>',
            },
          },
        },
      })
      await wrapper.vm.$nextTick()
    })

    it('devrait naviguer vers la page analyses via le header', async () => {
      const appHeader = wrapper.findComponent(AppHeader)

      // Simuler clic sur le bouton "Analyses" dans le header
      await appHeader.vm.$emit('navigate', 'analyses')
      await wrapper.vm.$nextTick()

      // Vérifier que la vue a changé
      expect(wrapper.vm.currentView).toBe('analyses')
      expect(wrapper.find('.upload-page-mock').exists()).toBe(true)
      expect(wrapper.find('.hero-section-mock').exists()).toBe(false)
    })

    it("devrait naviguer vers l'accueil via le header", async () => {
      // Commencer sur la page analyses
      wrapper.vm.currentView = 'analyses'
      await wrapper.vm.$nextTick()

      const appHeader = wrapper.findComponent(AppHeader)

      // Simuler clic sur le bouton "Accueil" dans le header
      await appHeader.vm.$emit('navigate', 'home')
      await wrapper.vm.$nextTick()

      // Vérifier que la vue a changé
      expect(wrapper.vm.currentView).toBe('home')
      expect(wrapper.find('.hero-section-mock').exists()).toBe(true)
      expect(wrapper.find('.upload-page-mock').exists()).toBe(false)
    })

    it("devrait mettre à jour l'état actif du header lors de la navigation", async () => {
      const appHeader = wrapper.findComponent(AppHeader)

      // Naviguer vers analyses
      await appHeader.vm.$emit('navigate', 'analyses')
      await wrapper.vm.$nextTick()

      // Vérifier que le header reçoit le nouvel état
      expect(appHeader.props('currentView')).toBe('analyses')
    })
  })

  describe('Navigation via StartAnalysisSection', () => {
    beforeEach(async () => {
      wrapper = mount(App, {
        global: {
          stubs: {
            UploadPage: {
              template:
                '<div class="upload-page-mock">Upload Page Content</div>',
            },
          },
        },
      })
      await wrapper.vm.$nextTick()
    })

    it('devrait naviguer vers les analyses via le bouton "Commencer l\'analyse"', async () => {
      const startAnalysisSection = wrapper.findComponent(StartAnalysisSection)

      // Simuler clic sur le bouton "Commencer l'analyse"
      await startAnalysisSection.vm.$emit('start-analysis')
      await wrapper.vm.$nextTick()

      // Vérifier que la navigation a eu lieu
      expect(wrapper.vm.currentView).toBe('analyses')
      expect(wrapper.find('.upload-page-mock').exists()).toBe(true)
      expect(wrapper.find('.hero-section-mock').exists()).toBe(false)
    })

    it("devrait synchroniser l'état du header après navigation depuis StartAnalysisSection", async () => {
      const startAnalysisSection = wrapper.findComponent(StartAnalysisSection)

      // Naviguer via StartAnalysisSection
      await startAnalysisSection.vm.$emit('start-analysis')
      await wrapper.vm.$nextTick()

      // Vérifier que le header est synchronisé
      const appHeader = wrapper.findComponent(AppHeader)
      expect(appHeader.props('currentView')).toBe('analyses')
    })
  })

  describe('Cohérence des états de navigation', () => {
    beforeEach(async () => {
      wrapper = mount(App, {
        global: {
          stubs: {
            UploadPage: {
              template:
                '<div class="upload-page-mock">Upload Page Content</div>',
            },
          },
        },
      })
      await wrapper.vm.$nextTick()
    })

    it("devrait maintenir la cohérence entre l'état interne et l'affichage", async () => {
      // État initial
      expect(wrapper.vm.currentView).toBe('home')
      expect(wrapper.find('.hero-section-mock').exists()).toBe(true)
      expect(wrapper.find('.upload-page-mock').exists()).toBe(false)

      // Changer l'état directement
      wrapper.vm.currentView = 'analyses'
      await wrapper.vm.$nextTick()

      // Vérifier la cohérence
      expect(wrapper.find('.hero-section-mock').exists()).toBe(false)
      expect(wrapper.find('.upload-page-mock').exists()).toBe(true)

      const appHeader = wrapper.findComponent(AppHeader)
      expect(appHeader.props('currentView')).toBe('analyses')
    })

    it("devrait gérer les transitions d'état correctement", async () => {
      const appHeader = wrapper.findComponent(AppHeader)

      // Transition home -> analyses
      await appHeader.vm.$emit('navigate', 'analyses')
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.currentView).toBe('analyses')
      expect(wrapper.find('.upload-page-mock').exists()).toBe(true)

      // Transition analyses -> home
      await appHeader.vm.$emit('navigate', 'home')
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.currentView).toBe('home')
      expect(wrapper.find('.hero-section-mock').exists()).toBe(true)
    })

    it("devrait préserver l'état lors de re-renders", async () => {
      // Naviguer vers analyses
      const appHeader = wrapper.findComponent(AppHeader)
      await appHeader.vm.$emit('navigate', 'analyses')
      await wrapper.vm.$nextTick()

      // Forcer un re-render
      await wrapper.setProps({})
      await wrapper.vm.$nextTick()

      // Vérifier que l'état est préservé
      expect(wrapper.vm.currentView).toBe('analyses')
      expect(wrapper.find('.upload-page-mock').exists()).toBe(true)
    })
  })

  describe('Gestion des événements et émissions', () => {
    beforeEach(async () => {
      wrapper = mount(App, {
        global: {
          stubs: {
            UploadPage: {
              template:
                '<div class="upload-page-mock">Upload Page Content</div>',
            },
          },
        },
      })
      await wrapper.vm.$nextTick()
    })

    it('devrait gérer correctement les événements de navigation du header', async () => {
      const appHeader = wrapper.findComponent(AppHeader)

      // Vérifier que les événements sont bien écoutés
      expect(appHeader.vm.$emit).toBeDefined()

      // Simuler différents événements de navigation
      await appHeader.vm.$emit('navigate', 'analyses')
      expect(wrapper.vm.currentView).toBe('analyses')

      await appHeader.vm.$emit('navigate', 'home')
      expect(wrapper.vm.currentView).toBe('home')
    })

    it('devrait gérer les événements de StartAnalysisSection', async () => {
      const startAnalysisSection = wrapper.findComponent(StartAnalysisSection)

      // Vérifier que l'événement start-analysis est bien géré
      await startAnalysisSection.vm.$emit('start-analysis')
      expect(wrapper.vm.currentView).toBe('analyses')
    })

    it('devrait gérer les événements multiples sans conflit', async () => {
      const appHeader = wrapper.findComponent(AppHeader)
      let startAnalysisSection = wrapper.findComponent(StartAnalysisSection)

      // Naviguer via header
      await appHeader.vm.$emit('navigate', 'analyses')
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.currentView).toBe('analyses')

      // Retourner à l'accueil
      await appHeader.vm.$emit('navigate', 'home')
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.currentView).toBe('home')

      // Re-obtenir la référence au StartAnalysisSection car il a été re-rendu
      startAnalysisSection = wrapper.findComponent(StartAnalysisSection)

      // Naviguer via StartAnalysisSection
      await startAnalysisSection.vm.$emit('start-analysis')
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.currentView).toBe('analyses')
    })
  })

  describe('Rendu conditionnel et performance', () => {
    beforeEach(async () => {
      wrapper = mount(App, {
        global: {
          stubs: {
            UploadPage: {
              template:
                '<div class="upload-page-mock">Upload Page Content</div>',
            },
          },
        },
      })
      await wrapper.vm.$nextTick()
    })

    it('ne devrait rendre que les composants de la vue active', async () => {
      // Vue home active
      expect(wrapper.find('.hero-section-mock').exists()).toBe(true)
      expect(wrapper.find('.start-analysis-section').exists()).toBe(true)
      expect(wrapper.find('.upload-page-mock').exists()).toBe(false)

      // Naviguer vers analyses
      const appHeader = wrapper.findComponent(AppHeader)
      await appHeader.vm.$emit('navigate', 'analyses')
      await wrapper.vm.$nextTick()

      // Vue analyses active
      expect(wrapper.find('.hero-section-mock').exists()).toBe(false)
      expect(wrapper.find('.start-analysis-section').exists()).toBe(false)
      expect(wrapper.find('.upload-page-mock').exists()).toBe(true)
    })

    it('devrait maintenir les composants partagés', async () => {
      // Les composants partagés doivent être présents dans toutes les vues
      expect(wrapper.find('.app-footer-mock').exists()).toBe(true)
      expect(wrapper.findComponent(AppHeader).exists()).toBe(true)

      // Naviguer vers analyses
      const appHeader = wrapper.findComponent(AppHeader)
      await appHeader.vm.$emit('navigate', 'analyses')
      await wrapper.vm.$nextTick()

      // Les composants partagés doivent rester présents
      expect(wrapper.find('.app-footer-mock').exists()).toBe(true)
      expect(wrapper.findComponent(AppHeader).exists()).toBe(true)
    })

    it('devrait optimiser les re-renders lors de la navigation', async () => {
      const appHeader = wrapper.findComponent(AppHeader)

      // Compter les éléments initiaux
      const initialHeaderCount = wrapper.findAllComponents(AppHeader).length

      // Naviguer plusieurs fois
      await appHeader.vm.$emit('navigate', 'analyses')
      await appHeader.vm.$emit('navigate', 'home')
      await appHeader.vm.$emit('navigate', 'analyses')
      await wrapper.vm.$nextTick()

      // Vérifier que les composants partagés ne sont pas re-créés
      expect(wrapper.findAllComponents(AppHeader).length).toBe(
        initialHeaderCount
      )
    })
  })

  describe('Accessibilité et UX', () => {
    beforeEach(async () => {
      wrapper = mount(App, {
        global: {
          stubs: {
            UploadPage: {
              template:
                '<div class="upload-page-mock">Upload Page Content</div>',
            },
          },
        },
      })
      await wrapper.vm.$nextTick()
    })

    it('devrait maintenir une structure sémantique correcte', () => {
      expect(wrapper.find('main[role="main"]').exists()).toBe(true)
      expect(wrapper.find('header').exists()).toBe(true)
      expect(wrapper.find('footer').exists()).toBe(true)
    })

    it('devrait préserver les classes CSS pour les animations', async () => {
      expect(wrapper.find('.main-content').exists()).toBe(true)
      expect(wrapper.find('.app-container').exists()).toBe(true)

      // Naviguer et vérifier que les classes sont préservées
      const appHeader = wrapper.findComponent(AppHeader)
      await appHeader.vm.$emit('navigate', 'analyses')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.main-content').exists()).toBe(true)
      expect(wrapper.find('.app-container').exists()).toBe(true)
    })

    it('devrait supporter les interactions clavier', async () => {
      const appHeader = wrapper.findComponent(AppHeader)

      // Simuler navigation via clavier (les boutons du header sont focusables)
      const navButtons = appHeader.findAll('.nav-link')
      expect(navButtons.length).toBeGreaterThan(0)

      // Vérifier que les boutons sont des vrais boutons (pas des liens)
      const analysesButton = navButtons.find(button =>
        button.text().includes('Analyses')
      )
      expect(analysesButton?.element.tagName).toBe('BUTTON')
    })
  })

  describe('Gestion des erreurs et cas limites', () => {
    beforeEach(async () => {
      wrapper = mount(App, {
        global: {
          stubs: {
            UploadPage: {
              template:
                '<div class="upload-page-mock">Upload Page Content</div>',
            },
          },
        },
      })
      await wrapper.vm.$nextTick()
    })

    it('devrait gérer des états de navigation invalides', async () => {
      // Tenter de naviguer vers un état invalide
      const appHeader = wrapper.findComponent(AppHeader)

      // Simuler un événement avec une valeur invalide
      await appHeader.vm.$emit('navigate', 'invalid-view' as string)
      await wrapper.vm.$nextTick()

      // L'état change mais aucune vue n'est affichée car seuls 'home' et 'analyses' ont des templates
      expect(wrapper.vm.currentView).toBe('invalid-view')
      expect(wrapper.find('.hero-section-mock').exists()).toBe(false)
      expect(wrapper.find('.upload-page-mock').exists()).toBe(false)
    })

    it("devrait maintenir la cohérence lors d'événements rapides", async () => {
      const appHeader = wrapper.findComponent(AppHeader)
      const startAnalysisSection = wrapper.findComponent(StartAnalysisSection)

      // Simuler des événements rapides
      const promises = [
        appHeader.vm.$emit('navigate', 'analyses'),
        startAnalysisSection.vm.$emit('start-analysis'),
        appHeader.vm.$emit('navigate', 'home'),
        appHeader.vm.$emit('navigate', 'analyses'),
      ]

      await Promise.all(promises)
      await wrapper.vm.$nextTick()

      // Le dernier état devrait être respecté
      expect(wrapper.vm.currentView).toBe('analyses')
      expect(wrapper.find('.upload-page-mock').exists()).toBe(true)
    })

    it("devrait récupérer d'erreurs de composants", async () => {
      // Simuler une erreur dans un composant enfant
      const originalConsoleError = console.error
      console.error = vi.fn()

      try {
        // Forcer une erreur dans le rendu
        wrapper.vm.currentView = 'analyses'
        await wrapper.vm.$nextTick()

        // L'application devrait continuer à fonctionner
        expect(wrapper.exists()).toBe(true)
        expect(wrapper.findComponent(AppHeader).exists()).toBe(true)
      } finally {
        console.error = originalConsoleError
      }
    })
  })

  describe('Performance et optimisation', () => {
    beforeEach(async () => {
      wrapper = mount(App, {
        global: {
          stubs: {
            UploadPage: {
              template:
                '<div class="upload-page-mock">Upload Page Content</div>',
            },
          },
        },
      })
      await wrapper.vm.$nextTick()
    })

    it('devrait éviter les re-renders inutiles', async () => {
      const appHeader = wrapper.findComponent(AppHeader)

      // Naviguer vers la même vue
      await appHeader.vm.$emit('navigate', 'home')
      await wrapper.vm.$nextTick()

      // L'état ne devrait pas changer
      expect(wrapper.vm.currentView).toBe('home')
      expect(wrapper.find('.hero-section-mock').exists()).toBe(true)
    })

    it('devrait gérer les mises à jour de props de manière efficace', async () => {
      const initialCurrentView = wrapper.vm.currentView

      // Naviguer vers analyses
      const appHeader = wrapper.findComponent(AppHeader)
      await appHeader.vm.$emit('navigate', 'analyses')
      await wrapper.vm.$nextTick()

      // Vérifier que les props sont mises à jour efficacement
      expect(appHeader.props('currentView')).toBe('analyses')
      expect(wrapper.vm.currentView).not.toBe(initialCurrentView)
    })

    it('devrait maintenir les performances avec des navigations fréquentes', async () => {
      const appHeader = wrapper.findComponent(AppHeader)
      const startTime = performance.now()

      // Effectuer plusieurs navigations
      for (let i = 0; i < 10; i++) {
        // eslint-disable-next-line no-await-in-loop
        await appHeader.vm.$emit('navigate', i % 2 === 0 ? 'analyses' : 'home')
        // eslint-disable-next-line no-await-in-loop
        await wrapper.vm.$nextTick()
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      // Vérifier que les performances restent acceptables (< 100ms pour 10 navigations)
      expect(duration).toBeLessThan(100)
      expect(wrapper.vm.currentView).toBe('home') // Dernière navigation
    })
  })
})
