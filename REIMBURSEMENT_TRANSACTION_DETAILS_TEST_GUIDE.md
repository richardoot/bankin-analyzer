# Guide de Test - Détails des Transactions dans ReimbursementSummary

## Objectif

Tester la nouvelle fonctionnalité de liste repliable qui affiche les détails des transactions
individuelles sous chaque catégorie d'une personne dans le composant ReimbursementSummary.vue.

## Fonctionnalités Implémentées

### 1. Extension de l'Interface Props

- ✅ Ajout de `filteredExpenses?: Transaction[]` dans l'interface Props
- ✅ Ajout de `stats` pour les statistiques (optionnel)
- ✅ Import du type `Transaction` depuis `@/types`

### 2. Nouveaux États Réactifs

- ✅ `expandedTransactionDetails`: Set<string> pour gérer les détails expandus par personne et
  catégorie

### 3. Nouvelles Computed Properties

- ✅ `expenseDetailsByPersonAndCategory`: Mapping des transactions par personId et categoryName
- ✅ Reconstruction des IDs de transactions basée sur la logique existante

### 4. Nouvelles Fonctions Helper

- ✅ `toggleTransactionDetails(personId: string, categoryName: string)`: Bascule l'état d'expansion
- ✅ `getTransactionDetails(personId: string, categoryName: string)`: Récupère les détails des
  transactions

### 5. Modifications du Template

- ✅ Section "Détail par personne avec catégories" modifiée
- ✅ Headers de catégories maintenant cliquables
- ✅ Boutons d'expansion avec icônes rotatifs
- ✅ Sections expandables pour les détails de transactions

### 6. Styles CSS Ajoutés

- ✅ `.category-header-clickable`: Headers cliquables avec hover
- ✅ `.expand-details-btn`: Boutons d'expansion stylisés
- ✅ `.transaction-details`: Conteneur pour les détails
- ✅ `.transaction-detail-item`: Items individuels de transaction
- ✅ `.transaction-info`: Informations de transaction (date, description, note)
- ✅ `.transaction-amounts`: Montants (base et remboursement)

## Tests à Effectuer

### 1. Test de Base

1. **Prérequis**: Avoir des données d'expenses et d'assignments dans l'application
2. **Naviguer** vers la section "Détail par personne avec catégories"
3. **Vérifier** que les catégories sont affichées pour chaque personne
4. **Vérifier** que chaque catégorie a maintenant un bouton de chevron (▼)

### 2. Test d'Expansion/Contraction

1. **Cliquer** sur une catégorie (header cliquable)
2. **Vérifier** que la section se développe et affiche les détails des transactions
3. **Vérifier** que l'icône de chevron tourne (devient ▲)
4. **Cliquer** à nouveau sur la même catégorie
5. **Vérifier** que la section se contracte et que l'icône reprend sa position initiale

### 3. Test des Détails de Transaction

Quand une section est expandue, vérifier que chaque transaction affiche :

- ✅ **Date**: formatée en français (DD/MM/YYYY)
- ✅ **Description**: description de la dépense
- ✅ **Note**: note de la dépense (si présente)
- ✅ **Montant de base**: montant original de la dépense
- ✅ **Montant à rembourser**: montant assigné à la personne

### 4. Test de l'Interface

1. **Vérifier** les styles visuels :

   - Headers cliquables avec effet hover
   - Boutons d'expansion bien positionnés
   - Transitions fluides
   - Couleurs et espacements cohérents

2. **Vérifier** la responsivité :
   - Affichage correct sur différentes tailles d'écran
   - Layout flexible des détails de transaction

### 5. Test des Cas Limites

1. **Catégorie sans transactions**: Vérifier l'affichage du message "Aucune transaction trouvée"
2. **Personne sans catégories**: Comportement normal attendu
3. **Multiples catégories expandues**: Vérifier que plusieurs sections peuvent être ouvertes
   simultanément

### 6. Test de Performance

1. **Avec beaucoup de données**: Vérifier que l'expansion/contraction reste fluide
2. **Navigation**: Vérifier que l'état d'expansion est préservé lors des interactions

## Structure des Données Attendues

### Détails de Transaction Affichés

```typescript
{
  date: string,           // Date de la transaction
  description: string,    // Description de la dépense
  note: string,          // Note associée (optionnelle)
  baseAmount: number,    // Montant original de la dépense
  reimbursementAmount: number // Montant à rembourser par la personne
}
```

### Clé d'Expansion

Format: `${personId}-${categoryName}`

## Points de Vérification Technique

### 1. Props Extended

```typescript
interface Props {
  expensesManagerRef?: {
    expenseAssignments?: Array<{...}>
    filteredExpenses?: Transaction[]  // ✅ Ajouté
    stats?: {...}                     // ✅ Ajouté
  } | null
}
```

### 2. Computed Property

La `expenseDetailsByPersonAndCategory` reconstruit correctement les IDs de transaction en utilisant
:

```typescript
e.account + '|' + e.date + '|' + e.description + '|' + e.amount === assignment.transactionId
```

### 3. Template Integration

Les nouvelles sections sont intégrées dans la structure existante sans briser l'interface
utilisateur actuelle.

## Résultat Attendu

- ✅ Interface utilisateur enrichie avec possibilité d'explorer les détails
- ✅ Meilleure traçabilité des remboursements
- ✅ Présentation claire des informations de transaction
- ✅ Expérience utilisateur fluide et intuitive

## Notes d'Implémentation

- Utilisation de `Set` pour une gestion efficace des états d'expansion
- Formatage des dates en français
- Gestion gracieuse des cas où les données sont manquantes
- Préservation de la performance avec des computed properties optimisées
- Styles cohérents avec le design system existant
