# 🏗️ Guide de Développement

## 📐 Architecture du Projet

### Stack Technique

- **Frontend** : Vue 3 + TypeScript + Vite
- **Styling** : CSS3 avec variables personnalisées
- **Outils** : Husky, ESLint, Prettier, Commitlint
- **Tests** : Validation manuelle + guides de test

### Structure des Dossiers

```
src/
├── components/           # Composants Vue réutilisables
│   ├── AppHeader.vue    # Navigation principale
│   ├── BarChart.vue     # Graphiques en barres
│   ├── PieChart.vue     # Graphiques en secteurs
│   ├── PersonsManager.vue    # Gestion des personnes
│   ├── ExpensesReimbursementManager.vue  # Remboursements
│   └── ...
├── composables/         # Logique métier réutilisable
│   ├── useFileUpload.ts # Gestion des fichiers
│   ├── usePdfExport.ts  # Export PDF
│   └── ...
├── types/              # Définitions TypeScript
│   └── index.ts        # Types globaux
└── pages/              # Pages de l'application
    ├── HomePage.vue    # Page d'accueil
    └── DashboardPage.vue  # Tableau de bord
```

## 🛠️ Conventions de Développement

### Composants Vue

```vue
<!-- Toujours utiliser la Composition API avec <script setup> -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Person, Category } from '@/types'

// Props avec types explicites
interface Props {
  person: Person
  categories: Category[]
  readonly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
})

// Émissions avec types
interface Emits {
  update: [person: Person]
  delete: [id: string]
}

const emit = defineEmits<Emits>()

// État réactif
const isEditing = ref(false)
const formData = ref<Partial<Person>>({})

// Calculs dérivés
const isValid = computed(
  () => formData.value.name?.trim() && (!formData.value.email || isValidEmail(formData.value.email))
)

// Fonctions métier
function handleSubmit() {
  if (!isValid.value) return
  emit('update', formData.value as Person)
  isEditing.value = false
}
</script>

<template>
  <!-- Template simple et lisible -->
  <div class="person-card">
    <div v-if="!isEditing" class="person-display">
      <h3>{{ person.name }}</h3>
      <p v-if="person.email">{{ person.email }}</p>
    </div>

    <form v-else @submit.prevent="handleSubmit">
      <!-- Formulaire d'édition -->
    </form>
  </div>
</template>

<style scoped>
/* Styles scopés au composant */
.person-card {
  /* CSS avec variables personnalisées */
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
}
</style>
```

### TypeScript

```typescript
// Types exhaustifs et précis
export interface Transaction {
  id: string
  date: string
  amount: number
  description: string
  category?: string
  account: string
  isPointedExpense?: boolean
}

export interface Person {
  id: string
  name: string
  email?: string // Email optionnel
  createdAt: string
}

export interface ReimbursementAssignment {
  id: string
  transactionId: string
  personId: string
  categoryId: string
  amount: number
  createdAt: string
}

// Utilitaires de type
export type CreatePerson = Omit<Person, 'id' | 'createdAt'>
export type UpdatePerson = Partial<CreatePerson> & Pick<Person, 'id'>
```

### Composables

```typescript
// Logique métier réutilisable
export function usePersonsManager() {
  const persons = ref<Person[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Chargement initial
  onMounted(async () => {
    await loadPersons()
  })

  async function loadPersons() {
    try {
      isLoading.value = true
      const saved = localStorage.getItem('bankin-analyzer-persons')
      persons.value = saved ? JSON.parse(saved) : []
    } catch (err) {
      error.value = 'Erreur lors du chargement des personnes'
      console.error(err)
    } finally {
      isLoading.value = false
    }
  }

  async function createPerson(data: CreatePerson) {
    const person: Person = {
      id: generateId(),
      ...data,
      createdAt: new Date().toISOString(),
    }

    persons.value.push(person)
    await savePersons()
    return person
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

## 🎨 Design System

### Variables CSS

```css
:root {
  /* Couleurs principales */
  --primary-50: #eff6ff;
  --primary-500: #3b82f6;
  --primary-900: #1e3a8a;

  /* Couleurs sémantiques */
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;

  /* Espacements */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;

  /* Bordures */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;

  /* Ombres */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 300ms ease;
}
```

### Composants UI Standards

```vue
<!-- Bouton standardisé -->
<template>
  <button :class="buttonClasses" :disabled="loading || disabled" @click="handleClick">
    <icon v-if="loading" name="spinner" class="animate-spin" />
    <icon v-else-if="icon" :name="icon" />
    <slot />
  </button>
</template>

<script setup lang="ts">
const buttonClasses = computed(() => [
  'btn',
  `btn--${variant}`,
  `btn--${size}`,
  { 'btn--loading': loading },
])
</script>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  font-weight: 500;
  transition: var(--transition-fast);
  cursor: pointer;
}

.btn--primary {
  background: var(--primary-500);
  color: white;
}

.btn--primary:hover {
  background: var(--primary-600);
}
</style>
```

## 🪝 Git Hooks et Workflow

### Configuration Husky

Le projet utilise Husky pour gérer les hooks Git avec optimisations performance 2025 :

```javascript
// .husky/pre-commit
# Optimisé - skip si aucun fichier staged
if [ -z "$(git diff --staged --name-only)" ]; then
  echo "Aucun fichier stagé, skip pre-commit"
  exit 0
fi

# Lint-staged avec type checking conditionnel
npm run lint-staged

# Type checking seulement si fichiers TS/Vue modifiés
if git diff --staged --name-only | grep -q '\.(ts|vue)$'; then
  npm run type-check
fi

// .husky/commit-msg
npx commitlint --edit $1

// .husky/prepare-commit-msg
# Template automatique basé sur nom de branche
branch_name=$(git branch --show-current)
if [[ $branch_name =~ ^feat/.* ]]; then
  echo "feat: " > $1
elif [[ $branch_name =~ ^fix/.* ]]; then
  echo "fix: " > $1
fi

// .husky/pre-push
npm run build
npm run test
```

### Hooks Configurés

#### **pre-commit**

- ✅ Lint-staged (ESLint + Prettier) sur fichiers modifiés
- ✅ Type checking TypeScript conditionnel
- ✅ Détection commentaires TODO/FIXME
- ✅ Performance optimisée (skip si rien à traiter)

#### **commit-msg**

- ✅ Validation Conventional Commits avec commitlint
- ✅ Longueur sujet max 60 caractères
- ✅ Longueur lignes max 100 caractères
- ✅ Scopes valides autorisés

#### **prepare-commit-msg**

- ✅ Templates automatiques basés sur nom de branche
- ✅ Détection numéros de tickets
- ✅ Suggestion type de commit approprié

#### **pre-push**

- ✅ Build de production
- ✅ Tests automatisés
- ✅ Vérifications complètes

### Messages de Commit

Suivre les [Conventional Commits](https://www.conventionalcommits.org/) :

```bash
# Types autorisés
feat: nouvelle fonctionnalité
fix: correction de bug
docs: mise à jour documentation
style: formatage, point-virgules manquants, etc.
refactor: refactoring du code
test: ajout ou modification de tests
chore: tâches de maintenance

# Exemples validés par les hooks
feat(persons): add email validation with regex
fix(charts): correct tooltip positioning in BarChart
docs: update installation guide
refactor(dashboard): extract chart logic to composables
```

### Validation du Workflow

#### Tests Effectués

- **Performance** : Traitement en parallèle optimisé
- **Robustesse** : Gestion d'erreurs avec fallback
- **UX Développeur** : Messages colorés et informatifs
- **CI/CD Ready** : Compatible avec environnements automatisés

#### Scripts Utiles

```bash
npm run hooks:test          # Test des hooks Git
npm run commit             # Commit interactif avec commitizen
npm run fix-all           # Correction automatique (ESLint + Prettier)
npm run check-all         # Vérifications complètes pré-push
```

## 📊 Gestion des Données

### LocalStorage

```typescript
// Clés standardisées
const STORAGE_KEYS = {
  PERSONS: 'bankin-analyzer-persons',
  CATEGORIES: 'bankin-analyzer-categories',
  ASSIGNMENTS: 'bankin-analyzer-assignments',
  TRANSACTIONS: 'bankin-analyzer-transactions',
} as const

// Sauvegarde sécurisée
function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (error) {
    console.error(`Erreur sauvegarde ${key}:`, error)
    throw new Error(`Impossible de sauvegarder ${key}`)
  }
}

// Chargement avec fallback
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : fallback
  } catch (error) {
    console.warn(`Erreur chargement ${key}, utilisation fallback:`, error)
    return fallback
  }
}
```

### Validation des Données

```typescript
// Schémas de validation
const personSchema = {
  id: (v: any) => typeof v === 'string' && v.length > 0,
  name: (v: any) => typeof v === 'string' && v.trim().length > 0,
  email: (v: any) => !v || isValidEmail(v),
}

function validatePerson(data: any): data is Person {
  return Object.entries(personSchema).every(([key, validator]) => validator(data[key]))
}

// Nettoyage automatique
function cleanOrphanedAssignments(
  assignments: ReimbursementAssignment[],
  persons: Person[],
  transactions: Transaction[]
) {
  const personIds = new Set(persons.map(p => p.id))
  const transactionIds = new Set(transactions.map(t => t.id))

  return assignments.filter(a => personIds.has(a.personId) && transactionIds.has(a.transactionId))
}
```

## 🧪 Testing

### Tests Manuels

Suivre les procédures détaillées dans [TESTING_GUIDE.md](./TESTING_GUIDE.md)

### Validation Continue

```bash
# Vérifications avant commit
npm run type-check    # Validation TypeScript
npm run lint         # ESLint
npm run format       # Prettier
npm run build        # Build de production

# Script tout-en-un
npm run check-all
```

## 🚀 Déploiement

### Build de Production

```bash
# Build optimisé
npm run build

# Prévisualisation locale
npm run preview

# Vérification du build
ls -la dist/
```

### Variables d'Environnement

```bash
# .env.development
VITE_APP_TITLE=Bankin Analyzer (Dev)
VITE_DEBUG=true

# .env.production
VITE_APP_TITLE=Bankin Analyzer
VITE_DEBUG=false
```

## 📚 Ressources

- [Vue 3 Composition API](https://vuejs.org/guide/extras/composition-api-faq.html)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Guide](https://vitejs.dev/guide/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [CSS Modern Features](https://web.dev/learn/css/)
