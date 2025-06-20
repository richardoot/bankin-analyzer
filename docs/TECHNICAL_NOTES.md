# 🔧 Notes Techniques

## 🐛 Corrections Importantes

### Fix Tooltips BarChart (Décembre 2024)

**Problème** : Les tooltips du graphique des revenus ne s'affichaient pas correctement par rapport à
ceux des dépenses.

**Cause** : Le positionnement du tooltip utilisait un sélecteur global
`document.querySelector('.chart-container')` qui créait des conflits quand plusieurs composants
BarChart étaient présents sur la même page.

**Solution Implémentée** :

```vue
<!-- Ajout d'une ref locale pour chaque composant -->
<div ref="chartContainerRef" class="chart-container"></div>
```

**CSS Ajouté** :

```css
.bar-chart-container {
  position: relative;
  overflow: visible;
}

.chart-container {
  position: relative;
  overflow: visible;
}
```

**Résultat** : Les tooltips des deux graphiques (dépenses et revenus) ont maintenant un comportement
identique et restent correctement positionnés dans leur composant respectif.

### Fix "Invalid Date" en Export PDF

**Problème** : Les dates s'affichaient comme "Invalid Date" dans l'export PDF.

**Cause** : Gestion incorrecte des formats de dates français (DD/MM/YYYY) vs ISO (YYYY-MM-DD).

**Solution** :

```typescript
function formatTransactionDate(dateStr: string): string {
  if (!dateStr) return dateStr

  // Format ISO (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
  }

  // Format français (DD/MM/YYYY) - retourner tel quel
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    return dateStr
  }

  return dateStr // Retourner tel quel si format inconnu
}
```

### Synchronisation PersonsManager ↔ ExpensesReimbursementManager

**Problème** : Suppression d'une personne ne nettoyait pas automatiquement ses assignations.

**Solution** : Watcher automatique avec nettoyage des assignations orphelines.

```typescript
// Dans ExpensesReimbursementManager
watch(
  () => persons.value,
  () => {
    cleanupOrphanedAssignments()
  },
  { deep: true }
)

function cleanupOrphanedAssignments() {
  const validPersonIds = new Set(persons.value.map(p => p.id))
  assignments.value = assignments.value.filter(a => validPersonIds.has(a.personId))
  saveAssignments()
}
```

### Filtrage Avancé avec Masquage Automatique

**Problème** : Les filtres affichaient des options vides quand aucune donnée correspondante.

**Solution** : Filtrage intelligent avec masquage automatique des éléments sans données.

```typescript
const availableAccounts = computed(() => {
  const accounts = [...new Set(filteredTransactions.value.map(t => t.account))]
  return accounts.filter(account => account && account.trim())
})

const hasDataForAccount = computed(() => (account: string) => {
  return filteredTransactions.value.some(t => t.account === account)
})
```

## ⚡ Optimisations Performance

### Pagination Intelligente

**Implémentation** :

```typescript
const ITEMS_PER_PAGE = 50
const currentPage = ref(1)

const paginatedTransactions = computed(() => {
  const start = (currentPage.value - 1) * ITEMS_PER_PAGE
  const end = start + ITEMS_PER_PAGE
  return filteredTransactions.value.slice(start, end)
})

const totalPages = computed(() => Math.ceil(filteredTransactions.value.length / ITEMS_PER_PAGE))
```

### Debouncing pour Recherche

```typescript
import { debounce } from 'lodash-es'

const searchQuery = ref('')
const debouncedSearch = debounce((query: string) => {
  // Logique de recherche
}, 300)

watch(searchQuery, debouncedSearch)
```

### Lazy Loading Composants

```typescript
// Dans les routes ou imports
const PersonsManager = defineAsyncComponent(() => import('@/components/PersonsManager.vue'))
```

## 🎨 Améliorations UX/UI

### Tooltips Enrichis

**Implémentation** :

```vue
<div
  v-if="tooltip.visible"
  class="tooltip"
  :style="tooltipStyle"
>
  <div class="tooltip-header">
    <strong>{{ tooltip.data.account }}</strong>
  </div>
  <div class="tooltip-content">
    <p>Montant: {{ formatCurrency(tooltip.data.amount) }}</p>
    <p>Date: {{ formatDate(tooltip.data.date) }}</p>
    <p v-if="tooltip.data.assignments">
      Assigné: {{ formatCurrency(getAssignedAmount(tooltip.data.id)) }}
    </p>
  </div>
</div>
```

### États de Chargement

```vue
<template>
  <div class="loading-state" v-if="isLoading">
    <div class="spinner"></div>
    <p>Chargement des données...</p>
  </div>

  <div class="empty-state" v-else-if="items.length === 0">
    <div class="empty-icon">📭</div>
    <h3>Aucune donnée disponible</h3>
    <p>Importez un fichier CSV pour commencer.</p>
  </div>

  <div class="content" v-else>
    <!-- Contenu normal -->
  </div>
</template>
```

### Responsive Design

```css
/* Mobile First */
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

## 🔍 Patterns de Développement

### Composables Pattern

```typescript
// useLocalStorage.ts
export function useLocalStorage<T>(key: string, defaultValue: T) {
  const storedValue = ref<T>(defaultValue)

  function load() {
    try {
      const item = localStorage.getItem(key)
      storedValue.value = item ? JSON.parse(item) : defaultValue
    } catch (error) {
      console.warn(`Erreur chargement ${key}:`, error)
      storedValue.value = defaultValue
    }
  }

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(storedValue.value))
    } catch (error) {
      console.error(`Erreur sauvegarde ${key}:`, error)
    }
  }

  // Auto-save sur changement
  watch(storedValue, save, { deep: true })

  // Chargement initial
  onMounted(load)

  return { value: storedValue, load, save }
}
```

### Validation Pattern

```typescript
// useValidation.ts
export function useValidation<T>(rules: ValidationRules<T>) {
  const errors = ref<Partial<Record<keyof T, string>>>({})

  function validate(data: T): boolean {
    errors.value = {}
    let isValid = true

    for (const [field, rule] of Object.entries(rules)) {
      const error = rule(data[field as keyof T])
      if (error) {
        errors.value[field as keyof T] = error
        isValid = false
      }
    }

    return isValid
  }

  const hasErrors = computed(() => Object.keys(errors.value).length > 0)

  return { errors, validate, hasErrors }
}

// Utilisation
const { errors, validate } = useValidation({
  name: (value: string) => (!value?.trim() ? 'Nom requis' : null),
  email: (value: string) => {
    if (!value) return null // Optionnel
    return isValidEmail(value) ? null : 'Email invalide'
  },
})
```

### Error Boundary Pattern

```vue
<!-- ErrorBoundary.vue -->
<template>
  <div v-if="error" class="error-boundary">
    <h3>❌ Une erreur est survenue</h3>
    <p>{{ error.message }}</p>
    <button @click="retry">Réessayer</button>
  </div>
  <slot v-else />
</template>

<script setup>
const error = ref<Error | null>(null)

function handleError(err: Error) {
  error.value = err
  console.error('Erreur capturée:', err)
}

function retry() {
  error.value = null
}

// Capturer les erreurs des composants enfants
onErrorCaptured((err) => {
  handleError(err)
  return false
})
</script>
```

## 📊 Monitoring et Debug

### Performance Monitoring

```typescript
// utils/performance.ts
export function measurePerformance(name: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value

    descriptor.value = function (...args: any[]) {
      const start = performance.now()
      const result = originalMethod.apply(this, args)
      const end = performance.now()

      console.log(`${name}: ${end - start}ms`)
      return result
    }
  }
}

// Utilisation
class DataProcessor {
  @measurePerformance('CSV Parsing')
  parseCSV(data: string) {
    // Logique de parsing
  }
}
```

### Debug Helpers

```typescript
// utils/debug.ts
export const DEBUG = import.meta.env.VITE_DEBUG === 'true'

export function debugLog(component: string, ...args: any[]) {
  if (DEBUG) {
    console.log(`[${component}]`, ...args)
  }
}

export function debugTable(component: string, data: any[]) {
  if (DEBUG) {
    console.group(`[${component}] Data Table`)
    console.table(data)
    console.groupEnd()
  }
}
```

### État Global Debug

```typescript
// stores/debug.ts
export const useDebugStore = defineStore('debug', () => {
  const logs = ref<DebugLog[]>([])
  const isEnabled = ref(DEBUG)

  function addLog(level: 'info' | 'warn' | 'error', message: string, data?: any) {
    if (!isEnabled.value) return

    logs.value.push({
      id: generateId(),
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    })

    // Garder seulement les 100 derniers logs
    if (logs.value.length > 100) {
      logs.value = logs.value.slice(-100)
    }
  }

  return { logs, isEnabled, addLog }
})
```

## 🚀 Déploiement et CI/CD

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

### Environment Configuration

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

```typescript
// ✅ Bon
interface Person {
  readonly id: string
  name: string
  email?: string
}

function createPerson(data: CreatePersonData): Person {
  return {
    id: generateId(),
    name: data.name.trim(),
    email: data.email?.trim() || undefined,
    createdAt: new Date().toISOString(),
  }
}

// ❌ Éviter
function createPerson(name: any, email: any): any {
  return {
    id: Math.random().toString(),
    name: name,
    email: email,
    createdAt: Date.now(),
  }
}
```

### Gestion des Erreurs

```typescript
// ✅ Bon
async function saveData<T>(key: string, data: T): Promise<void> {
  try {
    const serialized = JSON.stringify(data)
    localStorage.setItem(key, serialized)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('Espace de stockage insuffisant')
    }
    throw new Error(`Impossible de sauvegarder ${key}: ${error.message}`)
  }
}

// ❌ Éviter
function saveData(key: string, data: any) {
  localStorage.setItem(key, JSON.stringify(data))
}
```

### Tests et Validation

```typescript
// ✅ Bon
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

describe('validateEmail', () => {
  test('valide un email correct', () => {
    expect(validateEmail('test@example.com')).toBe(true)
  })

  test('invalide un email incorrect', () => {
    expect(validateEmail('email-invalide')).toBe(false)
  })
})
```

Cette documentation technique servira de référence pour les futures modifications et optimisations
du projet.
