# Test Manuel - Export PDF avec Détails de Transactions

## Objectif

Valider que l'export PDF inclut correctement les détails de transactions individuelles avec le
formatage attendu.

## Données de Test

Utiliser le fichier `test-transaction-details-demo.csv` qui contient :

- 15 transactions réparties sur 4 catégories
- Restaurants (5 transactions)
- Courses (4 transactions)
- Transport (3 transactions)
- Santé (3 transactions)
- Chaque transaction a une note descriptive

## Étapes de Test

### 1. Import des Données

1. Ouvrir l'application sur http://localhost:5177/
2. Cliquer sur "Importer des données CSV"
3. Sélectionner le fichier `test-transaction-details-demo.csv`
4. Vérifier que les données sont correctement importées

### 2. Configuration des Remboursements

1. Aller dans l'onglet "Configuration"
2. Configurer au moins une personne avec des taux de remboursement pour les catégories testées :
   - Restaurants : 50%
   - Courses : 30%
   - Transport : 70%
   - Santé : 100%

### 3. Génération du Résumé

1. Aller dans l'onglet "Résumé des Remboursements"
2. Vérifier que les transactions sont visibles dans l'interface
3. S'assurer que les détails de transactions s'affichent correctement

### 4. Export PDF

1. Cliquer sur "Exporter en PDF"
2. Télécharger et ouvrir le PDF généré

## Points de Validation dans le PDF

### ✅ Structure Générale

- [ ] Le PDF contient les sections habituelles (Résumé, Détails par Personne)
- [ ] La mise en page générale est préservée

### ✅ Détails de Transactions

- [ ] Chaque catégorie affiche la liste de ses transactions
- [ ] Format d'affichage : Date | Description | Note (si présente)
- [ ] Montants : Montant de base → Montant remboursé
- [ ] Dates au format français (DD/MM/YYYY)
- [ ] Montants au format français (€)

### ✅ Hiérarchie Visuelle

- [ ] Les transactions sont clairement groupées sous chaque catégorie
- [ ] L'indentation ou le style différencie les transactions du reste
- [ ] Les montants sont alignés et lisibles

### ✅ Contenu Attendu

- [ ] Restaurants : 5 transactions (Le Bistrot, Pizza Roma, Café Central, Sushi Time, Thai Garden)
- [ ] Courses : 4 transactions (Carrefour, Boulangerie Martin, Monoprix, Épicerie Bio)
- [ ] Transport : 3 transactions (Station Total, Uber, Métro RATP)
- [ ] Santé : 3 transactions (Pharmacie du Centre, Médecin généraliste, Pharmacie Moderne)

### ✅ Formatage des Montants

- [ ] Exemple attendu : "-45,50 € → -22,75 €" pour Restaurant Le Bistrot (50% remboursement)
- [ ] Tous les montants négatifs sont correctement affichés
- [ ] Les calculs de remboursement sont corrects

## Résultat Attendu

Le PDF doit présenter un niveau de détail enrichi permettant de voir exactement quelles transactions
composent chaque catégorie de remboursement, avec un formatage professionnel et lisible.

## Actions en Cas de Problème

1. Vérifier les messages de console dans le navigateur
2. Contrôler les données dans l'onglet "Données Importées"
3. Valider la configuration des remboursements
4. Tester avec un sous-ensemble de données si nécessaire

---

_Test créé pour validation manuelle de l'export PDF enrichi_ _État de l'implémentation : Technique
complète, validation manuelle en cours_
