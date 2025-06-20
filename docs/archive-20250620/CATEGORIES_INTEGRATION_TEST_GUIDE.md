# Guide de Test - Intégration des Catégories de Remboursement

## Vue d'ensemble

Cette documentation guide les tests de l'intégration complète des catégories de remboursement dans
le système d'association des personnes aux remboursements.

## Fonctionnalités Intégrées

### 1. Création et Gestion des Catégories

- **Module** : `ReimbursementCategoriesManager.vue`
- **Fonctionnalités** :
  - Création de catégories personnalisées avec icônes, couleurs et mots-clés
  - Modification et suppression des catégories existantes
  - Stockage en localStorage avec clé `bankin-analyzer-reimbursement-categories`

### 2. Association des Catégories aux Personnes

- **Module** : `ExpensesReimbursementManager.vue`
- **Fonctionnalités** :
  - Sélecteur de catégorie dans la modal d'assignation
  - Extension de l'interface `PersonAssignment` avec `categoryId?: string`
  - Chargement automatique des catégories depuis localStorage
  - Tooltip enrichi montrant la catégorie assignée

### 3. Affichage par Catégories Assignées

- **Module** : `ReimbursementSummary.vue`
- **Fonctionnalités** :
  - Calcul des remboursements par catégorie assignée (non par catégorie de transaction)
  - Section "Détail par personne avec catégories"
  - Section "Remboursements par catégorie" avec totaux
  - Affichage des icônes et noms des catégories

## Scénarios de Test

### Test 1 : Configuration Initiale des Catégories

1. **Accéder au gestionnaire de catégories**

   - Ouvrir l'application sur http://localhost:5174
   - Naviguer vers le gestionnaire de catégories de remboursement

2. **Créer des catégories de test**

   ```
   Catégorie 1:
   - Nom: "Restaurant"
   - Icône: 🍽️
   - Couleur: #ff6b6b
   - Description: "Frais de restaurant"
   - Mots-clés: restaurant, repas, food

   Catégorie 2:
   - Nom: "Transport"
   - Icône: 🚗
   - Couleur: #4ecdc4
   - Description: "Frais de transport"
   - Mots-clés: transport, taxi, train

   Catégorie 3:
   - Nom: "Hébergement"
   - Icône: 🏨
   - Couleur: #45b7d1
   - Description: "Frais d'hébergement"
   - Mots-clés: hotel, booking, logement
   ```

3. **Vérifier le stockage**
   - Ouvrir les outils développeur (F12)
   - Aller dans Application > Local Storage
   - Vérifier la présence de la clé `bankin-analyzer-reimbursement-categories`

### Test 2 : Association des Catégories aux Remboursements

1. **Préparer des données de test**

   - Charger un fichier CSV avec des transactions d'exemple
   - S'assurer d'avoir des personnes créées dans le gestionnaire de personnes

2. **Assigner des remboursements avec catégories**

   - Aller dans le gestionnaire des remboursements
   - Pour chaque transaction de dépense :
     - Cliquer sur "Assigner une personne"
     - Sélectionner une personne
     - Entrer un montant
     - **NOUVEAU** : Sélectionner une catégorie dans le dropdown
     - Valider l'assignation

3. **Vérifier l'affichage des assignations**
   - Les tooltips des badges de personnes doivent afficher la catégorie
   - Format attendu : "Nom Personne - 50.00€ (🍽️ Restaurant)"

### Test 3 : Visualisation dans le Résumé des Remboursements

1. **Accéder au résumé**

   - Naviguer vers la section "Résumé des remboursements"

2. **Vérifier la section "Détail par personne avec catégories"**

   - Chaque personne should afficher :
     - Son nom et total général
     - Liste de ses catégories avec montants
     - Badge indiquant le nombre de catégories

3. **Vérifier la section "Remboursements par catégorie"**
   - Chaque catégorie should afficher :
     - Nom avec icône (ex: "🍽️ Restaurant")
     - Total des remboursements pour cette catégorie
     - Liste des personnes concernées (expandable)

### Test 4 : Cas Edge et Validation

1. **Remboursements sans catégorie**

   - Créer des assignations sans sélectionner de catégorie
   - Vérifier qu'elles apparaissent sous "Sans catégorie spécifique"

2. **Suppression de catégories**

   - Supprimer une catégorie utilisée dans des assignations
   - Vérifier que les assignations restent mais sans catégorie

3. **Modification de catégories**

   - Modifier le nom/icône d'une catégorie
   - Vérifier que les affichages sont mis à jour

4. **Persistance des données**
   - Rafraîchir la page
   - Vérifier que toutes les assignations et catégories sont préservées

## Validation des Calculs

### Calculs Attendus

- **Total par personne** = Somme de tous ses remboursements (toutes catégories)
- **Total par catégorie** = Somme des remboursements de toutes les personnes pour cette catégorie
- **Détail personne-catégorie** = Montant spécifique d'une personne pour une catégorie donnée

### Exemple de Validation

```
Données de test :
- Alice : 100€ Restaurant + 50€ Transport = 150€ total
- Bob : 75€ Restaurant + 25€ Hébergement = 100€ total

Totaux par catégorie :
- Restaurant : 100€ + 75€ = 175€
- Transport : 50€
- Hébergement : 25€

Total général : 250€
```

## Points de Contrôle Critiques

### ✅ Intégration Technique

- [ ] Les catégories se chargent dans ExpensesReimbursementManager
- [ ] Le dropdown de catégorie fonctionne dans la modal
- [ ] Les categoryId sont sauvegardés avec les assignations
- [ ] ReimbursementSummary affiche les bonnes catégories

### ✅ Interface Utilisateur

- [ ] Les icônes des catégories s'affichent correctement
- [ ] Les tooltips montrent les informations complètes
- [ ] Les sections sont visuellement distinctes et claires
- [ ] Les totaux sont calculés et affichés correctement

### ✅ Persistance des Données

- [ ] Refresh de page préserve toutes les données
- [ ] Suppression/modification de catégories gérée proprement
- [ ] Pas de perte de données lors des opérations

## Résultats Attendus

Après un test complet réussi, l'utilisateur devrait pouvoir :

1. **Créer des catégories** personnalisées pour organiser les remboursements
2. **Assigner facilement** des catégories lors de l'attribution des remboursements
3. **Visualiser clairement** la répartition des remboursements par catégorie et par personne
4. **Avoir une vue d'ensemble** des dépenses organisées selon ses propres critères

Cette intégration transforme l'outil d'un simple calculateur de remboursements en un véritable
système de gestion des dépenses catégorisées.
