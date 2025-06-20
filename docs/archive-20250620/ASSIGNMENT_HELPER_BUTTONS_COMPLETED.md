# Boutons d'Aide pour l'Assignation des Montants ✨

## 🎯 Objectif Accompli

Ajout de **boutons d'aide intelligents** dans la modal d'assignation pour faciliter la définition
des sommes à rembourser, permettant aux utilisateurs de calculer automatiquement les montants les
plus courants.

## 🚀 Fonctionnalités Ajoutées

### 1. **Bouton "Total"**

- **Fonction** : Attribue automatiquement le montant total disponible
- **Icône** : 💰
- **Usage** : Quand une personne doit rembourser la totalité du montant restant
- **Exemple** : Si 75€ sont disponibles → Définit directement 75,00€

### 2. **Bouton "Diviser par 2"**

- **Fonction** : Divise le montant disponible par 2
- **Icône** : ➗
- **Usage** : Partage équitable entre 2 personnes
- **Exemple** : Si 100€ sont disponibles → Définit 50,00€

### 3. **Bouton "Diviser par N"**

- **Fonction** : Divise le montant par un nombre personnalisé (2-10)
- **Icône** : 🔢
- **Usage** : Partage équitable entre plusieurs personnes
- **Interface** : Bouton + champ numérique + validation Enter
- **Exemple** : 150€ ÷ 3 personnes = 50,00€

## 🎨 Interface Utilisateur

### Disposition

```vue
<!-- Boutons d'aide placés avant le champ de saisie -->
<div class="amount-helper-buttons">
  [💰 Total] [➗ Diviser par 2] [🔢 Diviser par [N]]
</div>
<input type="number" placeholder="Montant..." />
```

### Design

- **Style** : Boutons compacts avec dégradé gris moderne
- **Interactions** : Hover, focus et animations fluides
- **Responsive** : Disposition flexible qui s'adapte aux petits écrans
- **Tooltips** : Descriptions explicatives au survol

## 🔧 Implémentation Technique

### Variables Ajoutées

```typescript
const customDivider = ref<number>(2) // Diviseur personnalisé
```

### Fonction Principale

```typescript
const setAmountHelper = (type: string) => {
  const availableAmount = maxAvailableAmount.value

  switch (type) {
    case 'full':
      modalAmount.value = Math.round(availableAmount * 100) / 100
      break
    case 'half':
      modalAmount.value = Math.round((availableAmount / 2) * 100) / 100
      break
    case 'custom':
      if (customDivider.value && customDivider.value > 1) {
        modalAmount.value = Math.round((availableAmount / customDivider.value) * 100) / 100
      }
      break
  }
}
```

### Styles CSS

```css
.amount-helper-buttons {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  align-items: center;
}

.helper-btn {
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.helper-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
```

## 📱 Expérience Utilisateur

### Scénarios d'Usage

1. **Remboursement complet**

   - Clic sur "💰 Total" → Montant automatiquement défini
   - Gain de temps : aucune saisie manuelle

2. **Partage à deux**

   - Clic sur "➗ Diviser par 2" → Calcul automatique
   - Parfait pour couples ou colocs

3. **Partage multiple**
   - Saisir "3" dans le champ N → Clic sur "🔢 Diviser par"
   - Ou presser Enter dans le champ pour validation rapide
   - Idéal pour groupes d'amis ou sorties en équipe

### Validation Automatique

- **Respect des limites** : Les montants calculés respectent le `maxAvailableAmount`
- **Arrondi intelligent** : Arrondi au centime près (2 décimales)
- **Feedback visuel** : Indication immédiate du montant calculé

## 🧪 Tests et Validation

### Tests Fonctionnels

- ✅ Bouton "Total" : Définit exactement le montant disponible
- ✅ Bouton "Diviser par 2" : Calcule correctement la moitié
- ✅ Bouton "Diviser par N" : Fonctionne avec nombres 2-10
- ✅ Validation Enter : Active le calcul depuis le champ N
- ✅ Réinitialisation : `customDivider` remis à 2 à la fermeture

### Tests d'Interface

- ✅ Responsive : Boutons s'adaptent aux écrans mobiles
- ✅ Hover : Animations fluides et feedback visuel
- ✅ Tooltips : Descriptions explicatives accessibles
- ✅ Integration : Harmonie avec le design existant

## 💡 Avantages

### 1. **Productivité**

- Réduction drastique du temps de saisie
- Élimination des erreurs de calcul mental
- Workflows plus fluides

### 2. **Simplicité**

- Interface intuitive avec emojis expressifs
- Calculs automatiques sans prise de tête
- Pas besoin de sortir une calculatrice

### 3. **Polyvalence**

- Couvre les cas d'usage les plus fréquents
- Diviseur personnalisé pour situations spéciales
- Validation en temps réel

## 🔄 Compatibilité

- ✅ **Fonctionnalités existantes** : Validation des montants preservée
- ✅ **Calcul dynamique** : `maxAvailableAmount` toujours respecté
- ✅ **Assignations fantômes** : Nettoyage automatique maintenu
- ✅ **Interface compacte** : Avatars et tooltips fonctionnels

## 🎉 Résultat Final

L'ajout des boutons d'aide transforme la modal d'assignation en un outil puissant et convivial. Les
utilisateurs peuvent maintenant :

1. **Assigner rapidement** des montants complets ou partiels
2. **Calculer automatiquement** les partages équitables
3. **Personnaliser facilement** les divisions selon leurs besoins
4. **Gagner du temps** sur les tâches répétitives de remboursement

**URL de test** : http://localhost:5174/

---

## 📋 Prochaines Étapes Possibles

- [ ] Ajouter un bouton "Montant égal pour tous" (divise par nombre de personnes déjà assignées)
- [ ] Sauvegarder les préférences de diviseur personnalisé
- [ ] Ajouter des raccourcis clavier (Ctrl+1, Ctrl+2, etc.)
- [ ] Historique des montants récemment utilisés

**Mission accomplie ! 🎯✨**
