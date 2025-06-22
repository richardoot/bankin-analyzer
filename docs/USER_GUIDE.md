# 📖 Guide d'Installation et Utilisation

## 🛠️ Installation

### Prérequis

- **Node.js** version 18 ou supérieure
- **npm** ou **yarn**
- **Git** pour le développement

### Installation rapide

```bash
# Cloner le projet
git clone [url-du-repo]
cd bankin-analyzer

# Installer les dépendances
npm install

# Démarrer l'application
npm run dev
```

### Scripts disponibles

```bash
npm run dev              # Serveur de développement
npm run build            # Build de production
npm run preview          # Prévisualisation du build
npm run check-all        # Vérifications complètes
npm run commit           # Commit interactif avec conventions
npm run fix-all          # Correction automatique ESLint + Prettier
```

## 🚀 Premier Lancement

### 1. Interface d'Accueil

L'application s'ouvre sur une page d'accueil moderne avec :

- Présentation des fonctionnalités
- Navigation vers la page d'analyse
- Design responsive et accessible

### 2. Import de Données CSV

1. **Naviguer vers "Analyses"** depuis le menu
2. **Sélectionner un fichier CSV** via l'interface drag-and-drop
3. **Valider le format** - L'application accepte les exports Bankin (format CSV)
4. **Analyser les données** - Les transactions sont automatiquement parsées

### 3. Gestion des Personnes

1. **Accéder au gestionnaire** via le menu "Personnes"
2. **Ajouter des personnes** avec nom et email (optionnel)
3. **Modifier/Supprimer** via les actions dans les cartes
4. **Rechercher** en temps réel par nom ou email
5. **Import/Export** des données en JSON

### 4. Configuration des Catégories

1. **Ouvrir le gestionnaire** de catégories
2. **Créer des catégories** personnalisées (nom, icône, couleur)
3. **Utiliser les catégories par défaut** :
   - 🚗 Transport
   - 🍽️ Restauration
   - 🏨 Hébergement
   - 🖥️ Matériel
   - 📚 Formation

### 5. Assignation des Remboursements

1. **Sélectionner une transaction** dans la liste
2. **Choisir la personne** à rembourser
3. **Définir la catégorie** appropriée
4. **Ajuster le montant** avec les helpers (total, moitié, division)
5. **Valider l'assignation**

### 6. Analyse et Export

1. **Consulter le résumé** des remboursements par personne
2. **Filtrer par catégorie** ou personne
3. **Visualiser les graphiques** (barres et secteurs)
4. **Filtrer par mois** dans les graphiques camembert :
   - Utiliser la liste déroulante "Période" dans l'en-tête du graphique
   - Sélectionner un mois spécifique pour voir la répartition de cette période
   - Choisir "Tous les mois" pour revenir à la vue globale
   - Les filtres par mois sont indépendants entre dépenses et revenus
5. **Exporter en PDF** avec détails complets

## 📱 Fonctionnalités Avancées

### Dashboard Interactif

- **Graphiques harmonisés** avec tooltips informatifs
- **Filtrage par mois** dans les graphiques camembert avec sélecteur déroulant
- **Filtrage dynamique** par compte, catégorie, période
- **Synchronisation en temps réel** entre composants
- **Mode responsive** pour mobile et desktop

### Validation Intelligente

- **Montants** : Validation des limites et formats
- **Emails** : Regex robuste avec détection des doublons
- **Fichiers** : Validation du format CSV et de la structure
- **Données** : Nettoyage automatique des assignations orphelines

### Persistance Locale

- **localStorage** pour toutes les données
- **Récupération automatique** au démarrage
- **Gestion d'erreurs** gracieuse en cas de corruption
- **Sauvegarde continue** lors des modifications

## 🔒 Sécurité et Confidentialité

- **Traitement 100% local** - Aucune donnée transmise
- **Pas de serveur** - Fonctionnement hors ligne
- **Validation stricte** des fichiers et formats
- **Code TypeScript** pour la sécurité du typage

## 🐛 Résolution de Problèmes

### Erreurs courantes

**Fichier CSV non reconnu**

- Vérifier le format d'export Bankin
- S'assurer que les colonnes obligatoires sont présentes
- Vérifier l'encodage du fichier (UTF-8 recommandé)

**Données manquantes au rechargement**

- Vérifier que localStorage n'est pas désactivé
- Nettoyer le cache du navigateur si nécessaire
- Réimporter les données via les fonctions d'import

**Graphiques ne s'affichent pas**

- Vérifier qu'il y a des données dans les filtres sélectionnés
- Actualiser la page pour forcer le re-rendu
- Contrôler la console pour d'éventuelles erreurs JavaScript

**Tooltips mal positionnés**

- Problème corrigé dans la dernière version
- S'assurer d'utiliser la version la plus récente
- Redémarrer le serveur de développement si nécessaire

### Support technique

1. Consulter la console du navigateur pour les erreurs
2. Vérifier les [Notes Techniques](./TECHNICAL_NOTES.md) pour les corrections connues
3. Suivre les [procédures de test](./TESTING_GUIDE.md) pour reproduire les problèmes
