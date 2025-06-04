# Module de Gestion des Remboursements - Documentation

## Vue d'ensemble

Le module de gestion des remboursements a été intégré avec succès dans la page d'Analyse
(`AnalysesPage.vue`) sous forme d'onglet séparé du tableau de bord principal. Ce module permet aux
utilisateurs de gérer et suivre les remboursements basés sur leurs données financières importées.

## Architecture

### Composants Principaux

1. **AnalysesPage.vue** - Page principale avec système d'onglets
2. **ReimbursementManager.vue** - Composant dédié à la gestion des remboursements
3. **TransactionsList.vue** - Composant réutilisé pour afficher les transactions

### Structure de Navigation

```
AnalysesPage
├── Upload Section (État initial)
└── Analysis Interface (Après upload)
    ├── Onglet: Tableau de bord (DashboardPage)
    └── Onglet: Remboursements (ReimbursementManager)
```

## Fonctionnalités Implémentées

### ✅ Système d'Onglets Complet

- Navigation fluide entre tableau de bord et remboursements
- Design moderne avec animations et responsive
- Support mode sombre
- Icônes SVG pour une meilleure UX

### ✅ Interface ReimbursementManager

- **Section Statistiques** : Affichage des totaux et métriques
- **Filtrage Avancé** : Par catégorie et remboursabilité
- **Détection Intelligente** : Reconnaissance automatique des dépenses remboursables
- **Liste des Transactions** : Intégration avec TransactionsList existant

### ✅ Détection Automatique des Remboursements

Mots-clés reconnus automatiquement :

- Restaurants : "restaurant", "brasserie", "café", "pizza", etc.
- Transport : "uber", "taxi", "train", "avion", "hotel", etc.
- Professionnel : "fourniture", "matériel", "bureau", etc.

### ✅ Filtrage et Statistiques

- Filtrage par catégorie de dépenses
- Option pour afficher uniquement les dépenses remboursables
- Calculs en temps réel des totaux et pourcentages
- Interface responsive pour mobile et desktop

## Structure des Données

### Types TypeScript

```typescript
interface CsvAnalysisResult {
  isValid: boolean
  transactions: Transaction[]
  // ... autres propriétés
}

interface Transaction {
  type: 'income' | 'expense'
  category: string
  amount: number
  description: string
  date: string
  // ... autres propriétés
}
```

### Données Mockées (Temporaires)

```typescript
const availablePersons = [
  { id: '1', name: 'Jean Dupont', email: 'jean.dupont@email.com' },
  { id: '2', name: 'Marie Martin', email: 'marie.martin@email.com' },
  { id: '3', name: 'Pierre Durand', email: 'pierre.durand@email.com' },
]
```

## Prochaines Étapes de Développement

### 🔄 Gestion des Personnes

- [ ] Interface CRUD pour ajouter/modifier/supprimer des personnes
- [ ] Système de stockage persistant (localStorage ou base de données)
- [ ] Validation des emails et informations de contact

### 🔄 Marquage Manuel des Dépenses

- [ ] Boutons pour marquer/démarquer une dépense comme remboursable
- [ ] Attribution des dépenses à des personnes spécifiques
- [ ] Historique des modifications

### 🔄 Calculs de Remboursements

- [ ] Algorithme de répartition équitable
- [ ] Gestion des dépenses partagées (pourcentages)
- [ ] Calcul des montants nets entre personnes

### 🔄 Fonctionnalités d'Export

- [ ] Génération de rapports PDF
- [ ] Export CSV des remboursements
- [ ] Envoi d'emails automatisés

### 🔄 Améliorations UX

- [ ] Glisser-déposer pour attribution des dépenses
- [ ] Prévisualisation des remboursements en temps réel
- [ ] Notifications et alertes
- [ ] Sauvegarde automatique des modifications

## Guide d'Utilisation

### Accès au Module

1. Uploader un fichier CSV via la section d'upload
2. Cliquer sur l'onglet "Remboursements" dans l'interface d'analyse
3. Explorer les dépenses automatiquement détectées

### Filtrage des Données

- **Par Catégorie** : Utiliser le sélecteur de catégories pour filtrer les dépenses
- **Remboursables Uniquement** : Activer le toggle pour voir seulement les dépenses remboursables
- **Statistiques** : Consulter les métriques en temps réel dans la section statistiques

### Personnalisation

- Les mots-clés de détection peuvent être étendus dans le code
- Les catégories sont automatiquement extraites des données importées
- L'interface s'adapte au contenu disponible

## Code Source Principal

### Fichiers Modifiés

- `src/components/AnalysesPage.vue` - Intégration du système d'onglets
- `src/components/ReimbursementManager.vue` - Composant principal du module

### Dépendances

- Vue 3 Composition API
- TypeScript pour la sécurité des types
- Intégration avec les composants existants (TransactionsList, UploadSection)

## Validation et Tests

### Tests Manuels Effectués

- ✅ Navigation entre onglets
- ✅ Upload de fichier CSV et affichage des données
- ✅ Filtrage par catégorie
- ✅ Détection automatique des dépenses remboursables
- ✅ Calculs de statistiques
- ✅ Responsive design sur différentes tailles d'écran
- ✅ Mode sombre

### Tests Automatisés Recommandés

- [ ] Tests unitaires pour les fonctions de calcul
- [ ] Tests d'intégration pour le filtrage
- [ ] Tests E2E pour le workflow complet

## Notes Techniques

### Performance

- Utilisation de computed properties pour les calculs réactifs
- Filtrage efficace des transactions
- Pas de re-renders inutiles

### Maintenabilité

- Code TypeScript typé
- Composants modulaires et réutilisables
- Séparation claire des responsabilités
- Documentation inline pour les fonctions complexes

### Évolutivité

- Architecture modulaire permettant l'ajout de nouvelles fonctionnalités
- Interface claire entre les composants
- Possibilité d'intégration avec une API backend future
