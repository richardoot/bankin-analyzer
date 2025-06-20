# 🔧 Guide Technique - Bankin Analyzer

## 🏗️ Architecture

### Stack Technique

- **Frontend** : Vue 3 + Composition API + TypeScript
- **Build** : Vite 5.x avec optimisations bundle
- **Styling** : CSS3 moderne avec variables personnalisées
- **State** : localStorage + réactivité Vue native
- **Charts** : Chart.js avec customisations

### Structure Modulaire

```
src/
├── components/          # Composants Vue réutilisables
├── composables/         # Logique métier externalisée
├── types/              # Interfaces TypeScript
└── assets/             # Ressources statiques
```

## 🐛 Corrections Importantes

### Fix Tooltips BarChart (Décembre 2024)

**Problème** : Sélecteur CSS global ne ciblait que le premier graphique

```vue
// ❌ Avant - sélecteur global const tooltipContainer =
document.querySelector('.bar-chart-container') // ✅ Après - ref locale const chartContainerRef =
ref
<HTMLElement></HTMLElement>
```

**Impact** : Comportement identique entre graphiques dépenses/revenus

### Fix Export PDF Multi-pages

**Corrections CSS** appliquées :

```css
/* Prévention coupures inappropriées */
.pdf-section {
  page-break-inside: avoid;
}
.person-section {
  break-inside: avoid;
}
.category-group {
  page-break-inside: avoid;
}

/* Optimisation espacement */
.transaction-item {
  margin-bottom: 0.5em;
}
.section-header {
  page-break-after: avoid;
}
```

### Synchronisation Temps Réel PersonsManager

**Système d'événements** avec localStorage centralisé :

```typescript
// Émission lors des modifications
window.dispatchEvent(new CustomEvent('persons-updated'))

// Écoute dans ExpensesReimbursementManager
window.addEventListener('persons-updated', refreshPersonsList)
```

## ⚡ Optimisations Performance

### Lazy Loading Composants

```typescript
// Chargement différé des composants lourds
const PersonsManager = defineAsyncComponent(() => import('./PersonsManager.vue'))
const ExpensesReimbursementManager = defineAsyncComponent(
  () => import('./ExpensesReimbursementManager.vue')
)
```

### Traitement CSV Optimisé

```typescript
// Parser CSV avec validation streaming
const parseCSVLine = (line: string): Transaction | null => {
  try {
    const fields = line.split(',').map(field => field.trim().replace(/^"(.*)"$/, '$1'))
    return validateAndTransformTransaction(fields)
  } catch {
    return null // Ligne invalide ignorée
  }
}
```

### Gestion Mémoire

- **Pagination virtuelle** pour listes >1000 éléments
- **Debounce recherche** : 300ms délai
- **Cache computed** pour calculs coûteux
- **Cleanup listeners** lors du démontage

## 🎨 Design System

### Variables CSS

```css
:root {
  /* Couleurs principales */
  --primary-color: #3b82f6;
  --success-color: #10b981;
  --warning-color: #f59e0b;
  --error-color: #ef4444;

  /* Espacements */
  --spacing-xs: 0.5rem;
  --spacing-sm: 1rem;
  --spacing-md: 1.5rem;
  --spacing-lg: 2rem;

  /* Typographie */
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
}
```

### Responsive Design

```css
/* Mobile First approche */
.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--spacing-md);
}

@media (min-width: 768px) {
  .dashboard-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (min-width: 1024px) {
  .dashboard-grid {
    grid-template-columns: 2fr 1fr;
  }
}
```

## 🛠️ Patterns de Développement

### Composables Pattern

```typescript
// usePersons.ts - Logique métier centralisée
export function usePersons() {
  const persons = ref<Person[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const createPerson = async (person: CreatePersonRequest) => {
    // Validation + sauvegarde
  }

  // Auto-sauvegarde sur modification
  watch(persons, savePersons, { deep: true })

  return {
    persons: readonly(persons),
    isLoading: readonly(isLoading),
    error: readonly(error),
    createPerson,
    updatePerson,
    deletePerson,
    searchPersons,
  }
}
```

### Validation Pattern

```typescript
// Validation avec messages contextuels
const validateEmail = (email: string): ValidationResult => {
  if (!email) return { valid: true } // Optionnel

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { valid: false, message: 'Format email invalide' }
  }

  const isDuplicate = existingPersons.some(p => p.email === email)
  if (isDuplicate) {
    return { valid: false, message: 'Email déjà utilisé' }
  }

  return { valid: true }
}
```

### Error Boundary Pattern

```vue
<template>
  <div v-if="error" class="error-boundary">
    <h3>Une erreur est survenue</h3>
    <p>{{ error.message }}</p>
    <button @click="retry">Réessayer</button>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
// Gestion gracieuse des erreurs
const error = ref<Error | null>(null)

const retry = () => {
  error.value = null
  // Logique de récupération
}
</script>
```

## 📊 Gestion des Données

### LocalStorage Strategy

```typescript
// Sauvegarde avec compression et validation
const saveToStorage = <T>(key: string, data: T): void => {
  try {
    const serialized = JSON.stringify(data)
    localStorage.setItem(key, serialized)
  } catch (error) {
    console.error(`Erreur sauvegarde ${key}:`, error)
    showErrorMessage('Impossible de sauvegarder les données')
  }
}

// Récupération avec fallback
const loadFromStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : defaultValue
  } catch (error) {
    console.warn(`Erreur lecture ${key}:`, error)
    return defaultValue
  }
}
```

### Nettoyage Données Orphelines

```typescript
// Suppression automatique des assignations invalides
const cleanupOrphanedAssignments = () => {
  const validPersonIds = persons.value.map(p => p.id)
  const validCategoryIds = categories.value.map(c => c.id)

  assignments.value = assignments.value.filter(
    a => validPersonIds.includes(a.personId) && validCategoryIds.includes(a.categoryId)
  )
}
```

## 🧪 Testing

### Tests Manuels Automatisés

```javascript
// Scripts de validation dans le navigateur
const runAutomatedTests = () => {
  const tests = [
    () => testPersonCRUD(),
    () => testCSVParsing(),
    () => testTooltipPositioning(),
    () => testPDFGeneration(),
    () => testRealTimeSync(),
  ]

  return tests.map(test => {
    try {
      test()
      return { status: 'PASS', test: test.name }
    } catch (error) {
      return { status: 'FAIL', test: test.name, error }
    }
  })
}
```

### Validation Continue

```bash
# Checks pré-commit
npm run type-check    # Validation TypeScript
npm run lint         # ESLint avec --fix
npm run format       # Prettier
npm run build        # Build production

# Script tout-en-un
npm run check-all
```

## 🚀 Déploiement

### Build Optimizations

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router'],
          charts: ['chart.js'],
          utils: ['lodash-es', 'date-fns'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
```

### Variables d'Environnement

```bash
# .env.production
VITE_APP_TITLE=Bankin Analyzer
VITE_DEBUG=false
VITE_VERSION=$npm_package_version

# .env.development
VITE_APP_TITLE=Bankin Analyzer (Dev)
VITE_DEBUG=true
VITE_VERSION=dev
```

## 📚 Bonnes Pratiques

### Code Style

- **TypeScript strict** : `"strict": true` dans tsconfig
- **Props validation** : interfaces TypeScript + runtime checks
- **Reactive naming** : `isLoading`, `hasError`, `shouldShow`
- **Composables prefix** : `use` pour hooks logiques

### Gestion des Erreurs

- **Try-catch blocks** pour operations async
- **Fallback UI** pour états d'erreur
- **User feedback** avec toasts informatifs
- **Logging structuré** pour debugging

### Performance

- **Computed caching** pour calculs répétitifs
- **Event debouncing** pour recherche temps réel
- **Virtual scrolling** pour listes importantes
- **Lazy imports** pour code splitting

## 🔍 Debugging

### Console Utilities

```typescript
// Helper debug en développement
if (import.meta.env.DEV) {
  window.debugApp = {
    getPersons: () => persons.value,
    getAssignments: () => assignments.value,
    clearStorage: () => localStorage.clear(),
    runTests: () => runAutomatedTests(),
  }
}
```

### Error Monitoring

```typescript
// Capture erreurs Vue
app.config.errorHandler = (err, instance, info) => {
  console.error('Vue Error:', err, info)
  // Envoyer à service monitoring si production
}

// Capture erreurs globales
window.addEventListener('error', event => {
  console.error('Global Error:', event.error)
})
```

---

**Ce guide remplace** : `TECHNICAL_NOTES.md`, `DEVELOPER_GUIDE.md`, et les fichiers de corrections
spécifiques dans `docs/archive-20250620/`
