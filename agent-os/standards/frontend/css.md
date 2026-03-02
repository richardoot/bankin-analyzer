## CSS / Styling Rules - Finance Analyzer

### Principe fondamental

Utiliser **exclusivement Tailwind CSS** pour le styling des composants Vue.

### Regles obligatoires

1. **Pas de blocs `<style>`** dans les composants Vue (enforced par ESLint `vue/block-order`)
2. **Classes Tailwind** directement dans les templates
3. **`style.css`** reserve aux imports Tailwind globaux uniquement

### Exemple correct

```vue
<script setup lang="ts">
// Logic here
</script>

<template>
  <div class="flex items-center gap-4 bg-white p-4 rounded-lg">
    <span class="text-gray-900 font-medium">Texte</span>
  </div>
</template>
```

### Exemple interdit

```vue
<template>
  <div class="container">
    <span class="text">Texte</span>
  </div>
</template>

<style scoped>
.container {
  display: flex;
}
.text {
  color: #111;
}
</style>
```

### Exceptions rares

- Animations CSS complexes non realisables avec Tailwind
- Styles tiers de bibliotheques externes

### Best practices Tailwind

- **Consistent Methodology**: Utiliser les classes utilitaires Tailwind de maniere coherente
- **Design Tokens**: Respecter les couleurs et espacements definis dans le design system
- **Responsive**: Utiliser les prefixes responsive (`sm:`, `md:`, `lg:`, `xl:`)
- **Performance**: Les classes inutilisees sont automatiquement supprimees en production
