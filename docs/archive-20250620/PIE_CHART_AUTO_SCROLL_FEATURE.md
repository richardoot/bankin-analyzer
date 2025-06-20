# 🎯 Fonctionnalité de Scroll Automatique dans la Légende du Graphique Camembert

## ✨ Nouvelle Fonctionnalité Ajoutée

La légende du graphique camembert dispose maintenant d'un **scroll automatique intelligent** qui se
déclenche lorsque l'utilisateur survole un segment du graphique avec la souris.

## 🔧 Implémentation Technique

### 1. **Références Template**

```vue
<!-- Conteneur de la légende avec référence -->
<div ref="legendContainer" class="chart-legend">
  <div
    v-for="(category, index) in chartData.categories"
    :key="`legend-${index}`"
    :ref="el => setLegendItemRef(el, index)"
    class="legend-item"
    <!-- ...autres props -->
  >
```

### 2. **Variables Réactives**

```typescript
// Références pour le scroll automatique
const legendContainer = ref<HTMLElement | null>(null)
const legendItemRefs = ref<(HTMLElement | null)[]>([])
```

### 3. **Gestion des Références**

```typescript
// Fonction pour gérer les références des éléments de légende
const setLegendItemRef = (el: unknown, index: number) => {
  if (el && el instanceof HTMLElement) {
    legendItemRefs.value[index] = el
  }
}
```

### 4. **Logique de Scroll Automatique**

```typescript
// Fonction pour scroller automatiquement vers l'élément survolé
const scrollToLegendItem = (index: number) => {
  if (!legendContainer.value || !legendItemRefs.value[index]) return

  const container = legendContainer.value
  const item = legendItemRefs.value[index]

  // Position relative de l'élément dans le conteneur
  const itemTop = item.offsetTop
  const itemHeight = item.offsetHeight
  const containerHeight = container.clientHeight
  const scrollTop = container.scrollTop

  // Vérifie si l'élément est visible
  const isAbove = itemTop < scrollTop
  const isBelow = itemTop + itemHeight > scrollTop + containerHeight

  if (isAbove || isBelow) {
    // Calcule la position de scroll pour centrer l'élément
    const targetScrollTop = itemTop - containerHeight / 2 + itemHeight / 2

    // Animation de scroll fluide
    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth',
    })
  }
}
```

### 5. **Intégration dans le Hover**

```typescript
// Dans la fonction handleSegmentHover
if (isHover) {
  hoveredSegmentIndex.value = index
  const category = props.chartData.categories[index]

  if (!category) return

  // ✅ NOUVEAU : Scroll automatique vers l'élément de légende correspondant
  scrollToLegendItem(index)

  // ...reste de la logique
}
```

## 🎯 Comportement Utilisateur

### **Interaction Intuitive**

1. **Survol d'un segment** du graphique avec la souris
2. **Scroll automatique** vers l'élément correspondant dans la légende
3. **Animation fluide** (`behavior: 'smooth'`)
4. **Centrage intelligent** de l'élément dans la zone visible

### **Conditions de Déclenchement**

- ✅ L'élément de légende est **au-dessus** de la zone visible → Scroll vers le haut
- ✅ L'élément de légende est **en-dessous** de la zone visible → Scroll vers le bas
- ✅ L'élément est **déjà visible** → Pas de scroll (évite les mouvements inutiles)

### **Calcul Intelligent**

```typescript
// Vérifie si l'élément est visible
const isAbove = itemTop < scrollTop
const isBelow = itemTop + itemHeight > scrollTop + containerHeight

if (isAbove || isBelow) {
  // Centre l'élément dans la zone visible
  const targetScrollTop = itemTop - containerHeight / 2 + itemHeight / 2
}
```

## 🎨 Améliorations UX

### **Avantages pour l'Utilisateur**

✅ **Navigation intuitive** : Plus besoin de chercher manuellement dans la légende  
✅ **Feedback visuel immédiat** : L'élément correspondant est automatiquement visible  
✅ **Animation fluide** : Transition douce qui guide l'œil  
✅ **Économie d'effort** : Particulièrement utile avec de nombreuses catégories

### **Cas d'Usage Optimisés**

- 📊 **Nombreuses catégories** : Plus de 8-10 éléments dans la légende
- 🔍 **Exploration des données** : Survol rapide pour identifier les segments
- 📱 **Écrans mobiles** : Légende plus compacte avec scroll nécessaire
- 🎯 **Analyse détaillée** : Focus rapide sur une catégorie spécifique

## 🔄 Synchronisation Bidirectionnelle

La fonctionnalité fonctionne dans les deux sens :

1. **Graphique → Légende** : Survol d'un segment → Scroll vers l'élément de légende
2. **Légende → Graphique** : Survol d'un élément de légende → Highlight du segment

## 🚀 Résultat Final

L'utilisateur peut maintenant :

1. **Survoler n'importe quel segment** du graphique camembert
2. **Voir automatiquement** l'élément correspondant dans la légende
3. **Profiter d'une navigation fluide** sans effort manuel
4. **Analyser rapidement** les données même avec de nombreuses catégories

**Cette fonctionnalité améliore significativement l'expérience utilisateur et rend l'analyse des
données plus intuitive et efficace ! 🎯✨**
