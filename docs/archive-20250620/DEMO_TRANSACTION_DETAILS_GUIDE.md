# 🎯 Guide de Démonstration - Détails des Transactions Repliables

## 🚀 Démonstration Étape par Étape

### Étape 1 : Préparation des Données

1. **Ouvrir l'application** : [http://localhost:5174](http://localhost:5174)
2. **Importer le fichier de test** : `test-transaction-details-demo.csv`
   - Ce fichier contient 15 transactions réparties sur 4 catégories
   - Restaurants, Courses, Transport, Santé
   - Dates du 1er au 15 décembre 2024

### Étape 2 : Création des Personnes

1. **Aller dans "Gestion des Personnes"**
2. **Ajouter les personnes suivantes** :
   - Alice Dupont (alice@example.com)
   - Bob Martin (bob@example.com)
   - Claire Rousseau (claire@example.com)

### Étape 3 : Configuration des Catégories de Remboursement

1. **Aller dans "Catégories de Remboursement"**
2. **Vérifier/Ajouter les catégories** :
   - 🍽️ Restaurants Équipe (mots-clés: restaurant, bistrot, pizza, sushi, thai, café)
   - 🛒 Courses Partagées (mots-clés: carrefour, supermarché, monoprix, boulangerie, épicerie)
   - 🚗 Transport Professionnel (mots-clés: total, uber, métro, ratp)
   - 💊 Frais Médicaux (mots-clés: pharmacie, médecin, santé)

### Étape 4 : Assignation des Dépenses

1. **Aller dans "Gestionnaire des Dépenses"**
2. **Assigner les transactions suivantes** :

#### Restaurants Équipe (partagé entre Alice, Bob, Claire)

- Restaurant Le Bistrot (-45.50€) → Alice: 15.17€, Bob: 15.17€, Claire: 15.16€
- Restaurant Pizza Roma (-32.50€) → Alice: 10.84€, Bob: 10.83€, Claire: 10.83€
- Restaurant Sushi Time (-89.50€) → Alice: 29.84€, Bob: 29.83€, Claire: 29.83€
- Restaurant Thai Garden (-52.80€) → Alice: 17.60€, Bob: 17.60€, Claire: 17.60€

#### Courses Partagées (partagé entre Alice et Bob)

- Supermarché Carrefour (-123.80€) → Alice: 61.90€, Bob: 61.90€
- Boulangerie Martin (-8.50€) → Alice: 4.25€, Bob: 4.25€
- Monoprix (-67.30€) → Alice: 33.65€, Bob: 33.65€
- Épicerie Bio (-43.20€) → Alice: 21.60€, Bob: 21.60€

#### Transport Professionnel (Alice uniquement)

- Station Total (-85.00€) → Alice: 85.00€
- Uber (-15.20€) → Alice: 15.20€
- Métro RATP (-14.90€) → Alice: 14.90€

#### Frais Médicaux (Bob uniquement)

- Pharmacie du Centre (-28.90€) → Bob: 28.90€
- Médecin généraliste (-25.00€) → Bob: 25.00€
- Pharmacie Moderne (-19.60€) → Bob: 19.60€

### Étape 5 : Test de la Fonctionnalité Repliable

1. **Aller dans "Résumé des Remboursements"**
2. **Naviguer vers "Détail par personne avec catégories"**

#### Test avec Alice Dupont

1. **Vérifier l'affichage** :
   - 4 catégories visibles avec montants
   - Boutons de chevron (▼) sur chaque catégorie
2. **Cliquer sur "🍽️ Restaurants Équipe"** :

   - La section s'expand
   - Le chevron devient ▲
   - **4 transactions visibles** :
     - 01/12/2024 - Restaurant Le Bistrot - Note: "Dîner d'équipe" - Montant: 45.50€ - À rembourser:
       15.17€
     - 05/12/2024 - Restaurant Pizza Roma - Note: "Livraison pizza" - Montant: 32.50€ - À
       rembourser: 10.84€
     - 11/12/2024 - Restaurant Sushi Time - Note: "Dîner entre amis" - Montant: 89.50€ - À
       rembourser: 29.84€
     - 15/12/2024 - Restaurant Thai Garden - Note: "Repas de famille" - Montant: 52.80€ - À
       rembourser: 17.60€

3. **Cliquer sur "🛒 Courses Partagées"** :

   - **4 transactions visibles** :
     - 02/12/2024 - Supermarché Carrefour - Note: "Courses hebdomadaires" - Montant: 123.80€ - À
       rembourser: 61.90€
     - 06/12/2024 - Boulangerie Martin - Note: "Pain et viennoiseries" - Montant: 8.50€ - À
       rembourser: 4.25€
     - 09/12/2024 - Monoprix - Note: "Produits ménagers" - Montant: 67.30€ - À rembourser: 33.65€
     - 14/12/2024 - Épicerie Bio - Note: "Produits bio" - Montant: 43.20€ - À rembourser: 21.60€

4. **Tester la contraction** :
   - Cliquer à nouveau sur les catégories pour les refermer
   - Vérifier que les chevrons redeviennent ▼

#### Test avec Bob Martin

- **Vérifier les mêmes catégories Restaurants et Courses** (montants différents)
- **Vérifier la catégorie "💊 Frais Médicaux"** avec 3 transactions

#### Test avec Claire Rousseau

- **Vérifier uniquement la catégorie "🍽️ Restaurants Équipe"**

### Étape 6 : Tests Avancés

#### Test Multi-Expansion

1. **Ouvrir plusieurs catégories simultanément**
2. **Vérifier** que toutes restent ouvertes indépendamment

#### Test de Performance

1. **Ouvrir/fermer rapidement** plusieurs catégories
2. **Vérifier** la fluidité des animations

#### Test des Cas Limites

1. **Créer une personne** sans assignation
2. **Vérifier** l'affichage du message "Aucune donnée"

## 🎯 Points de Vérification

### Interface Utilisateur

- ✅ **Headers cliquables** avec effet hover
- ✅ **Chevrons rotatifs** avec transitions fluides
- ✅ **Sections repliables** avec animations
- ✅ **Typographie hiérarchisée** et lisible

### Données Affichées

- ✅ **Dates** formatées en français (JJ/MM/AAAA)
- ✅ **Descriptions** complètes des transactions
- ✅ **Notes** en italique (quand présentes)
- ✅ **Montants de base** des dépenses originales
- ✅ **Montants à rembourser** mis en évidence

### Comportement

- ✅ **État préservé** lors de la navigation
- ✅ **Multi-expansion** fonctionnelle
- ✅ **Performance** maintenue avec plusieurs transactions
- ✅ **Responsive design** sur différentes tailles d'écran

## 📊 Résultats Attendus

### Alice Dupont

- **Total à rembourser** : ~288.69€
- **4 catégories** avec transactions détaillées
- **15 transactions** au total réparties

### Bob Martin

- **Total à rembourser** : ~207.63€
- **3 catégories** avec transactions détaillées
- **10 transactions** au total

### Claire Rousseau

- **Total à rembourser** : ~73.42€
- **1 catégorie** avec transactions détaillées
- **4 transactions** restaurant

## 🎉 Succès de la Démonstration

Si tous les points ci-dessus sont vérifiés avec succès, la fonctionnalité de **détails des
transactions repliables** est parfaitement opérationnelle et prête pour la production !

---

**💡 Astuce** : Utilisez les données de test fournies pour une démonstration complète et
représentative de toutes les fonctionnalités.
