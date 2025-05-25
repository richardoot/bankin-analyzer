# Guide de test - Fonctionnalité de validation CSV

## Étapes pour tester la validation d'upload

1. **Ouvrir l'application** : http://localhost:5175/

2. **Naviguer vers la page d'analyses**

   - Cliquer sur "Analyses" dans le menu de navigation
   - Ou cliquer sur "Commencer l'analyse" depuis la page d'accueil

3. **Tester l'upload avec un fichier valide**

   - Utiliser le fichier `test-data.csv` créé dans le projet
   - Soit glisser-déposer le fichier dans la zone d'upload
   - Soit cliquer pour ouvrir le sélecteur de fichier

4. **Vérifier la modale de validation**

   - Une modale devrait s'ouvrir automatiquement
   - Afficher les statistiques du fichier :
     - Nombre de transactions (20)
     - Nombre de catégories (12)
     - Montant total
     - Période (2024-01-15 au 2024-02-10)
   - Liste des catégories détectées

5. **Naviguer vers le dashboard**

   - Cliquer sur "Voir le tableau de bord" dans la modale
   - Le dashboard devrait s'afficher avec toutes les statistiques

6. **Tester avec un fichier invalide**
   - Créer un fichier texte avec un contenu non-CSV
   - Essayer de l'uploader
   - Vérifier que l'erreur est bien affichée

## Fonctionnalités attendues

✅ **Upload de fichier CSV valide**

- Validation du format CSV
- Analyse automatique du contenu
- Détection des en-têtes Bankin
- Extraction des statistiques

✅ **Modale de validation**

- Interface moderne avec glassmorphism
- Statistiques complètes (transactions, catégories, montant, période)
- Prévisualisation des catégories
- Boutons d'action (Annuler/Confirmer)

✅ **Dashboard simple**

- Cartes de statistiques avec icônes
- Grille des catégories avec couleurs
- Design responsive et mode sombre
- Navigation fluide

✅ **Gestion d'erreurs**

- Validation des formats de fichier
- Messages d'erreur informatifs
- Gestion des fichiers corrompus

## Structure de test CSV

Le fichier `test-data.csv` contient des données au format Bankin :

```csv
Date,Libelle,Montant,Catégorie,Compte
2024-01-15,CARREFOUR MARKET,-45.30,Alimentation,Compte Courant
...
```

Avec les catégories : Alimentation, Revenus, Énergie, Shopping, Santé, Restaurants, Transport,
Divertissement, Épargne, Sport, Logement, Assurance.
