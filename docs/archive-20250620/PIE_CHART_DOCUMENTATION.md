# Composant PieChart - Documentation

## Vue d'ensemble

Le composant `PieChart` est un graphique camembert élégant et interactif conçu pour afficher la
répartition des dépenses et revenus par catégorie. Il respecte les bonnes pratiques Vue 3 avec
Composition API et TypeScript.

## Fonctionnalités

### 🎨 Design Premium

- Interface élégante avec effets de transparence et blur
- Palette de couleurs professionnelle pour les graphiques financiers
- Animations fluides et transitions modernes
- Design responsive pour tous les écrans

### 🖱️ Interactivité

- Survol des segments avec effet visuel
- Tooltip détaillé avec informations de la catégorie
- Clic sur les segments pour interactions personnalisées
- Légende interactive synchronisée avec le graphique

### 📊 Données

- Tri automatique des catégories par montant décroissant
- Calcul automatique des pourcentages
- Support des données vides avec message informatif
- Formatage automatique des montants et pourcentages

## Utilisation

### Import et Props

```vue
<script setup lang="ts">
import PieChart from '@/components/PieChart.vue'
import { usePieChart } from '@/composables/usePieChart'

// Données requises
const { expensesChartData, formatAmount, formatPercentage } = usePieChart(analysisResult)
</script>

<template>
  <PieChart
    :chart-data="expensesChartData"
    title="Répartition des dépenses"
    type="expenses"
    :format-amount="formatAmount"
    :format-percentage="formatPercentage"
    @category-click="handleCategoryClick"
    @category-hover="handleCategoryHover"
  />
</template>
```

### Props

| Prop               | Type                             | Description                                 |
| ------------------ | -------------------------------- | ------------------------------------------- |
| `chartData`        | `PieChartData`                   | Données du graphique avec catégories triées |
| `title`            | `string`                         | Titre affiché au-dessus du graphique        |
| `type`             | `'expenses' \| 'income'`         | Type pour l'icône et les couleurs           |
| `formatAmount`     | `(amount: number) => string`     | Fonction de formatage des montants          |
| `formatPercentage` | `(percentage: number) => string` | Fonction de formatage des pourcentages      |

### Événements

| Événement       | Payload                | Description                         |
| --------------- | ---------------------- | ----------------------------------- |
| `categoryClick` | `CategoryData`         | Émis lors du clic sur une catégorie |
| `categoryHover` | `CategoryData \| null` | Émis lors du survol d'une catégorie |

## Composable usePieChart

Le composable `usePieChart` fournit les données et utilitaires pour le graphique.

### Interface des données

```typescript
interface CategoryData {
  name: string
  value: number
  percentage: number
  color: string
}

interface PieChartData {
  categories: CategoryData[]
  total: number
}
```

### Fonctionnalités du composable

- **Traitement automatique** : Tri par valeur décroissante
- **Génération de couleurs** : Palette professionnelle avec fallback
- **Gestion des données vides** : Support des cas sans données
- **Formatage** : Fonctions pour montants et pourcentages

## Personnalisation

### Couleurs

Les couleurs sont générées automatiquement à partir d'une palette prédéfinie. Pour personnaliser :

```typescript
// Dans usePieChart.ts
const CHART_COLORS = [
  '#3B82F6', // Bleu principal
  '#6366F1', // Indigo
  // ... ajoutez vos couleurs
]
```

### Styles

Le composant utilise des CSS modules. Les principales classes :

- `.pie-chart-container` : Conteneur principal
- `.chart-svg-container` : Zone du graphique SVG
- `.chart-legend` : Légende du graphique
- `.hover-overlay` : Tooltip de survol

## Responsive

Le composant s'adapte automatiquement :

- **Desktop** : Graphique 300x300px avec légende complète
- **Tablet** : Graphique 250x250px avec légende compacte
- **Mobile** : Légende en colonne unique

## Accessibilité

- Navigation clavier supportée
- Attributs ARIA appropriés
- Contraste de couleurs respecté
- Tooltips informatifs

## Exemples d'usage

### Gestion des clics

```typescript
const handleCategoryClick = (category: CategoryData) => {
  // Filtrer les transactions par catégorie
  filterTransactionsByCategory(category.name)

  // Ou naviguer vers une vue détaillée
  router.push(`/category/${encodeURIComponent(category.name)}`)
}
```

### Gestion du survol

```typescript
const handleCategoryHover = (category: CategoryData | null) => {
  if (category) {
    // Mettre en surbrillance les éléments liés
    highlightRelatedElements(category.name)
  } else {
    // Retirer la surbrillance
    clearHighlight()
  }
}
```

## Performance

- **Computed properties** : Recalcul automatique optimisé
- **SVG léger** : Rendu vectoriel performant
- **Lazy loading** : Pas de calculs inutiles
- **Memory efficient** : Nettoyage automatique des événements
