# Guide de Test - Format CSV Bankin Mis à Jour

## 🔄 Changements Récents

### Nouveau Format CSV Bankin Supporté

L'application supporte maintenant le vrai format CSV Bankin avec les colonnes suivantes :

- **Date** : Date de la transaction
- **Description** : Libellé de la transaction
- **Compte** : Nom du compte bancaire
- **Montant** : Montant de la transaction (négatif pour les dépenses, positif pour les revenus)
- **Catégorie** : Catégorie principale (utilisée pour les dépenses)
- **Sous-Catégorie** : Sous-catégorie (utilisée pour les revenus)
- **Note** : Note personnelle
- **Pointée** : Statut de validation (Oui/Non)

### Logique de Catégorisation

#### 🔴 **Dépenses (Montants Négatifs)**

- Utilise la colonne **"Catégorie"** pour la classification
- Exemples : "Alimentation & Restau.", "Loisirs & Sorties", "Cadeaux"

#### 🟢 **Revenus (Montants Positifs)**

- Utilise la colonne **"Sous-Catégorie"** pour la classification
- Raison : Dans Bankin, tous les revenus ont la même catégorie "Entrées d'argent"
- Exemples : "Salaires", "R Parents", "R Erreurs"

## 📁 Fichiers de Test Disponibles

### 1. `test-bankin-real.csv`

Fichier avec le **vrai format CSV Bankin** incluant :

- 10 transactions réalistes
- Différents types de dépenses et revenus
- Format avec séparateur point-virgule (`;`)
- Guillemets autour des valeurs

### 2. `test-data.csv` (Legacy)

Ancien fichier de test pour compatibilité

## 🧪 Scénarios de Test

### Test 1 : Upload avec Format Bankin Réel

1. Aller sur l'onglet "Analyses"
2. Uploader `test-bankin-real.csv`
3. **Résultats attendus** :
   - ✅ Validation réussie
   - 📊 10 transactions détectées
   - 🏷️ Catégories séparées : dépenses vs revenus
   - 💰 Solde total calculé correctement

### Test 2 : Validation des En-têtes

1. Uploader un CSV avec des en-têtes incorrects
2. **Résultat attendu** : Message d'erreur avec les en-têtes requis

### Test 3 : Navigation Simplifiée

1. Uploader un fichier valide
2. Dans la modale : cliquer "Voir le tableau de bord"
3. **Résultats attendus** :
   - ✅ Dashboard affiché dans la même page
   - 🔄 Bouton "Nouvel upload" visible
   - 🚫 Module d'upload masqué

### Test 4 : Retour à l'Upload

1. Depuis le dashboard, cliquer "Nouvel upload"
2. **Résultats attendus** :
   - ✅ Retour à l'interface d'upload
   - 🚫 Dashboard masqué

## 📋 Données de Test dans `test-bankin-real.csv`

| Type       | Montant  | Catégorie Utilisée       | Description                 |
| ---------- | -------- | ------------------------ | --------------------------- |
| 💸 Dépense | -2000.0  | Erreurs                  | Virement préparation compte |
| 💰 Revenu  | +2299.71 | Salaires                 | Virement salaire            |
| 💸 Dépense | -15.38   | Cadeaux                  | Achat Paypal                |
| 💰 Revenu  | +500.0   | R Parents                | Remboursement prêt          |
| 💸 Dépense | -424.3   | Alimenter Compte Joint   | Virement                    |
| 💸 Dépense | -44.14   | Compléments Alimentaires | Achat Bulk                  |
| 💸 Dépense | -394.04  | En attente               | Attente remboursement       |
| 💰 Revenu  | +400.0   | R Erreurs                | Correction erreur           |
| 💸 Dépense | -50.0    | Sport                    | Abonnement fitness          |
| 💸 Dépense | -800.0   | PEA                      | Investissement              |

## 🎯 Points Clés de Validation

### ✅ Format CSV

- Séparateur : point-virgule (`;`)
- Encodage : UTF-8
- Guillemets : Présents autour des valeurs

### ✅ Parsing des Données

- Dates : Format DD/MM/YYYY
- Montants : Nombres décimaux avec point
- Catégories : Séparation dépenses/revenus

### ✅ Interface Utilisateur

- Navigation simplifiée (2 onglets seulement)
- Dashboard intégré dans "Analyses"
- Modale de validation fonctionnelle

## 🚀 Lancement du Test

```bash
cd /Users/richard.boilley/Projects/bankin-analyzer
npm run dev
```

Puis ouvrir : http://localhost:5173/

---

**Note** : Le format CSV Bankin utilise des points-virgules comme séparateurs et inclut des
guillemets autour des valeurs. L'application gère automatiquement ces spécificités.
