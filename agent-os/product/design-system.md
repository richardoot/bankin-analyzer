# Design System - Bankin Analyzer

Documentation du design global pour l'application d'analyse de dépenses bancaires.

---

## 1. Principes de Design

### 1.1 Mobile-First & Responsive

L'application est conçue en priorité pour mobile, puis adaptée aux tablettes et desktop. Les interfaces financières modernes privilégient l'accès mobile car les utilisateurs consultent leurs finances en déplacement.

### 1.2 Confiance & Sécurité

Les applications financières requièrent une confiance immédiate. Le design doit :

- Utiliser des couleurs stables et professionnelles
- Afficher clairement les données sans ambiguïté
- Éviter les animations excessives qui peuvent sembler peu sérieuses
- Maintenir une cohérence visuelle absolue

### 1.3 Simplicité & Clarté

> "L'argent est déjà stressant. Ne compliquez pas les choses avec une UX surchargée."

- Réduire la charge cognitive en limitant les informations affichées
- Transformer les chiffres en visualisations
- Utiliser un langage simple, pas de jargon financier
- Whitespace généreux pour une sensation de calme et contrôle

### 1.4 Accessibilité (WCAG 2.1)

- Contraste minimum 4.5:1 pour le texte
- Zones tactiles minimum 44x44px
- Support des lecteurs d'écran
- Mode sombre disponible
- Tailles de police ajustables

---

## 2. Palette de Couleurs

### 2.1 Couleurs Primaires

| Nom                | HEX       | Usage                                           |
| ------------------ | --------- | ----------------------------------------------- |
| **Vert Principal** | `#10B981` | Actions principales, revenus, éléments positifs |
| **Vert Foncé**     | `#059669` | Hover states, accents                           |
| **Vert Clair**     | `#D1FAE5` | Backgrounds subtils, badges positifs            |

> Le vert évoque la croissance, la prospérité et la santé financière. Inspiré de Wise, il devient une signature de marque reconnaissable.

### 2.2 Couleurs Secondaires

| Nom                | HEX       | Usage                                     |
| ------------------ | --------- | ----------------------------------------- |
| **Bleu Principal** | `#3B82F6` | Liens, informations, éléments interactifs |
| **Bleu Foncé**     | `#1E40AF` | Headers, navigation                       |
| **Bleu Clair**     | `#DBEAFE` | Backgrounds informatifs                   |

> Le bleu représente la confiance et la stabilité, essentiel pour une application financière.

### 2.3 Couleurs Sémantiques

| Nom         | HEX       | Usage                           |
| ----------- | --------- | ------------------------------- |
| **Succès**  | `#10B981` | Revenus, gains, confirmations   |
| **Danger**  | `#EF4444` | Dépenses, alertes, erreurs      |
| **Warning** | `#F59E0B` | Avertissements, limites proches |
| **Info**    | `#3B82F6` | Informations, tips              |

### 2.4 Couleurs Neutres

| Nom          | HEX       | Usage                         |
| ------------ | --------- | ----------------------------- |
| **Gris 900** | `#111827` | Texte principal               |
| **Gris 700** | `#374151` | Texte secondaire              |
| **Gris 500** | `#6B7280` | Texte désactivé, placeholders |
| **Gris 300** | `#D1D5DB` | Bordures                      |
| **Gris 100** | `#F3F4F6` | Backgrounds secondaires       |
| **Blanc**    | `#FFFFFF` | Background principal          |

### 2.5 Mode Sombre

| Élément          | Light Mode | Dark Mode |
| ---------------- | ---------- | --------- |
| Background       | `#FFFFFF`  | `#111827` |
| Surface          | `#F3F4F6`  | `#1F2937` |
| Texte principal  | `#111827`  | `#F9FAFB` |
| Texte secondaire | `#6B7280`  | `#9CA3AF` |
| Bordures         | `#D1D5DB`  | `#374151` |

---

## 3. Typographie

### 3.1 Police Principale

**Inter** - Police sans-serif moderne, optimisée pour les écrans et excellente lisibilité des chiffres.

```css
font-family:
  'Inter',
  system-ui,
  -apple-system,
  sans-serif;
```

### 3.2 Échelle Typographique

| Niveau     | Taille          | Poids | Usage                |
| ---------- | --------------- | ----- | -------------------- |
| **H1**     | 32px / 2rem     | 700   | Titre de page        |
| **H2**     | 24px / 1.5rem   | 600   | Sections principales |
| **H3**     | 20px / 1.25rem  | 600   | Sous-sections        |
| **H4**     | 16px / 1rem     | 600   | Cards headers        |
| **Body**   | 16px / 1rem     | 400   | Texte courant        |
| **Small**  | 14px / 0.875rem | 400   | Labels, captions     |
| **XSmall** | 12px / 0.75rem  | 400   | Badges, metadata     |

### 3.3 Affichage des Montants

```css
/* Montants financiers - chiffres tabulaires pour alignement */
.amount {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/* Grands montants (soldes, totaux) */
.amount-large {
  font-size: 2rem;
  font-weight: 700;
}

/* Montants inline (transactions) */
.amount-inline {
  font-size: 1rem;
  font-weight: 500;
}
```

### 3.4 Formatage des Nombres

- Séparateur de milliers : espace insécable
- Séparateur décimal : virgule (format français)
- Devise après le montant : `1 234,56 €`
- Signe négatif devant : `-125,00 €`
- Couleur : vert pour positif, rouge pour négatif

---

## 4. Composants UI

### 4.1 Dashboard - KPIs Cards

```
┌─────────────────────────────────────┐
│  Solde Total                        │
│  ┌─────────┐ ┌─────────┐           │
│  │ +2 450€ │ │ -1 830€ │           │
│  │ Revenus │ │ Dépenses│           │
│  └─────────┘ └─────────┘           │
│                                     │
│  Balance: +620,00 €                │
└─────────────────────────────────────┘
```

**Spécifications :**

- Border-radius : 12px
- Padding : 20px
- Shadow : `0 1px 3px rgba(0,0,0,0.1)`
- Background : blanc (light) / gris-900 (dark)

### 4.2 Liste de Transactions

```
┌─────────────────────────────────────┐
│ 🛒  Carrefour                       │
│     Alimentation · 15 jan           │
│                           -45,30 € │
├─────────────────────────────────────┤
│ 🚗  Station Total                   │
│     Transport · 14 jan              │
│                           -62,00 € │
├─────────────────────────────────────┤
│ 💼  Salaire                         │
│     Revenus · 10 jan                │
│                        +2 450,00 € │
└─────────────────────────────────────┘
```

**Spécifications :**

- Hauteur item : 72px
- Padding horizontal : 16px
- Icône catégorie : 40x40px avec background coloré
- Divider : 1px gris-200
- Swipe actions (mobile) : éditer, supprimer

### 4.3 Filtres

**Chips de filtres :**

```
[ Janvier ▼ ] [ Toutes catégories ▼ ] [ Tous comptes ▼ ]
```

- Hauteur : 36px
- Border-radius : 18px (pill)
- Background : gris-100 (inactif) / vert-principal (actif)
- Texte : gris-700 (inactif) / blanc (actif)

### 4.4 Navigation

**Bottom Navigation (Mobile) :**

```
┌─────────────────────────────────────┐
│  🏠      📊      💰      ⚙️        │
│ Accueil  Stats  Rembours. Params   │
└─────────────────────────────────────┘
```

- Hauteur : 64px + safe area
- Icône : 24px
- Label : 12px
- Item actif : couleur primaire
- Item inactif : gris-500

**Sidebar (Desktop) :**

- Largeur : 240px (expanded) / 64px (collapsed)
- Logo en haut
- Navigation items avec icônes + labels
- User avatar en bas

### 4.5 Modals

- Overlay : noir 50% opacité
- Card : blanc, border-radius 16px
- Largeur max : 480px
- Animation : slide-up (mobile) / fade-scale (desktop)
- Close button : X en haut à droite

### 4.6 Boutons

| Variante  | Background     | Texte          | Border         |
| --------- | -------------- | -------------- | -------------- |
| Primary   | Vert principal | Blanc          | -              |
| Secondary | Transparent    | Vert principal | Vert principal |
| Ghost     | Transparent    | Gris-700       | -              |
| Danger    | Rouge          | Blanc          | -              |

**Tailles :**

- Small : 32px hauteur, 12px padding
- Medium : 40px hauteur, 16px padding
- Large : 48px hauteur, 24px padding

---

## 5. Visualisation des Données

### 5.1 Types de Graphiques

#### Pie/Donut Chart - Répartition par Catégorie

```
        ┌───────────┐
       /   Alim.    \
      │    35%       │
      │  ┌─────┐     │
      │  │     │ Transport
      │  │     │   25%
       \ └─────┘   /
        └───────────┘
         Loisirs 20%
         Autres 20%
```

**Usage :** Montrer la proportion des dépenses par catégorie
**Recommandations :**

- Maximum 6-7 segments
- Regrouper les petites catégories dans "Autres"
- Afficher les pourcentages
- Légende interactive (clic pour filtrer)

#### Bar Chart - Évolution Mensuelle

```
   2500 │        ██
        │    ██  ██  ██
   2000 │    ██  ██  ██  ██
        │██  ██  ██  ██  ██
   1500 │██  ██  ██  ██  ██
        └─────────────────────
         Jan Fév Mar Avr Mai
```

**Usage :** Comparer les dépenses/revenus entre mois
**Recommandations :**

- Barres groupées pour revenus vs dépenses
- Ligne de tendance optionnelle
- Tooltip au hover avec détails
- Axe Y avec échelle auto-adaptée

#### Waterfall Chart - Flux de Trésorerie

```
   Solde initial  ████████████  2500€
   + Salaire      ████████████████████  +2450€
   - Loyer        ████████████████  -800€
   - Courses      ██████████████  -450€
   - Transport    █████████████  -200€
   = Solde final  ████████████████  3500€
```

**Usage :** Visualiser comment le solde évolue
**Recommandations :**

- Vert pour les entrées
- Rouge pour les sorties
- Gris pour les totaux intermédiaires

### 5.2 Couleurs par Catégorie

| Catégorie    | Couleur | HEX       |
| ------------ | ------- | --------- |
| Alimentation | Orange  | `#F97316` |
| Transport    | Bleu    | `#3B82F6` |
| Logement     | Violet  | `#8B5CF6` |
| Loisirs      | Rose    | `#EC4899` |
| Santé        | Rouge   | `#EF4444` |
| Shopping     | Jaune   | `#EAB308` |
| Revenus      | Vert    | `#10B981` |
| Autres       | Gris    | `#6B7280` |

### 5.3 Indicateurs de Tendance

```
↑ +15% vs mois dernier   (vert)
↓ -8% vs mois dernier    (rouge)
→ Stable                  (gris)
```

### 5.4 Microinteractions

- **Chargement données** : Skeleton loaders avec pulse animation
- **Mise à jour valeur** : Count-up animation
- **Changement de filtre** : Transition smooth 300ms
- **Hover sur chart** : Tooltip avec détails
- **Sélection segment** : Highlight + zoom léger

---

## 6. Patterns UX

### 6.1 Onboarding

**Étape 1 : Upload CSV**

```
┌─────────────────────────────────────┐
│                                     │
│         📁                          │
│                                     │
│   Glissez votre fichier CSV         │
│   exporté depuis Bankin             │
│                                     │
│   [ Parcourir... ]                  │
│                                     │
│   Formats acceptés: .csv            │
└─────────────────────────────────────┘
```

**Étape 2 : Aperçu des données**

- Afficher un résumé : X transactions, période couverte
- Permettre de valider avant analyse

**Étape 3 : Dashboard**

- Afficher immédiatement les insights principaux

### 6.2 Navigation Patterns

**Mobile :**

- Bottom navigation pour sections principales
- Swipe horizontal entre onglets
- Pull-to-refresh pour actualiser
- FAB pour action principale (upload)

**Desktop :**

- Sidebar fixe à gauche
- Breadcrumbs pour navigation profonde
- Tabs pour sous-sections
- Raccourcis clavier

### 6.3 Filtres & Recherche

**Filtres contextuels :**

- Affichés en haut de la liste/dashboard
- Persistants entre sessions
- Reset facile avec bouton "Effacer filtres"

**Recherche :**

- Recherche instantanée (debounce 300ms)
- Suggestions autocomplete
- Highlight des termes trouvés

### 6.4 États Vides

```
┌─────────────────────────────────────┐
│                                     │
│         📊                          │
│                                     │
│   Aucune transaction                │
│   pour cette période                │
│                                     │
│   Essayez de modifier vos filtres   │
│   ou importez plus de données       │
│                                     │
│   [ Importer un CSV ]               │
└─────────────────────────────────────┘
```

### 6.5 Gestion des Erreurs

- Messages clairs en langage simple
- Suggestion d'action pour résoudre
- Pas de codes d'erreur techniques
- Possibilité de réessayer

---

## 7. Responsive Design

### 7.1 Breakpoints

| Nom    | Largeur         | Cible          |
| ------ | --------------- | -------------- |
| **xs** | < 480px         | Petits mobiles |
| **sm** | 480px - 639px   | Mobiles        |
| **md** | 640px - 1023px  | Tablettes      |
| **lg** | 1024px - 1279px | Desktop        |
| **xl** | ≥ 1280px        | Grand écran    |

### 7.2 Adaptations par Device

**Mobile (xs, sm) :**

- Navigation bottom
- 1 colonne pour les cards
- Charts en pleine largeur
- Transactions en liste simple
- Filtres dans un drawer

**Tablette (md) :**

- Navigation sidebar collapsible
- 2 colonnes pour les cards
- Charts côte à côte possibles

**Desktop (lg, xl) :**

- Sidebar fixe expanded
- 3-4 colonnes pour les cards
- Dashboard avec layout flexible
- Filtres inline visibles

### 7.3 Touch vs Mouse

**Touch (mobile/tablet) :**

- Zones tactiles 44x44px minimum
- Swipe gestures
- Long press pour actions contextuelles
- Pas de hover states

**Mouse (desktop) :**

- Hover states sur tous les interactifs
- Tooltips au survol
- Right-click menus contextuels
- Focus states visibles (clavier)

---

## 8. Analyse Concurrentielle

### 8.1 Finary

**Forces :**

- UI moderne et épurée
- Focus sur le patrimoine global
- Analytics avancés (diversification, gains)
- Simulateur d'indépendance financière

**À retenir :**

- Catégorisation AI avancée
- Visualisations sophistiquées
- Positionnement premium

### 8.2 Linxo

**Forces :**

- Agrégation multi-comptes robuste
- Agrément Banque de France
- Notifications temps réel
- Support crypto-actifs

**À retenir :**

- Sécurité comme argument clé
- Couverture large de comptes
- UX simple et accessible

### 8.3 Bankin

**Forces :**

- Leader européen (6M+ utilisateurs)
- Excellent budgeting et catégorisation
- Prévisions de solde
- Interface familière

**À retenir :**

- Focus sur le quotidien
- Alertes et coaching budget
- Simplicité d'usage

### 8.4 Différenciation Bankin Analyzer

Notre positionnement unique :

- **Analyse d'exports CSV** : Pas besoin de connexion bancaire
- **Privacy-first** : Données traitées localement
- **Remboursements** : Gestion des dépenses partagées
- **Open source** : Transparence totale

---

## 9. Recommandations Techniques

### 9.1 Librairie de Composants

**Recommandé : PrimeVue**

- 80+ composants Vue 3
- Design system intégré
- Charts et data tables
- Mobile-first responsive
- Accessible (WCAG)

### 9.2 Charts

**Recommandé : Chart.js ou Apache ECharts**

- Léger et performant
- Bonne intégration Vue
- Responsive par défaut
- Customisable

### 9.3 Icônes

**Recommandé : Heroicons ou Phosphor Icons**

- Style cohérent
- Outline et filled variants
- Optimisées SVG

### 9.4 CSS

**Recommandé : Tailwind CSS**

- Utility-first pour rapidité
- Design tokens configurables
- Excellent responsive
- Dark mode natif

---

## 10. Sources & Références

- [Top 15 Banking Apps UX Design](https://www.wavespace.agency/blog/banking-app-ux)
- [Fintech UX Design Trends 2025](https://www.designstudiouiux.com/blog/fintech-ux-design-trends/)
- [Fintech Design Guide 2026](https://www.eleken.co/blog-posts/modern-fintech-design-guide)
- [Dashboard Design Patterns (IEEE)](https://dashboarddesignpatterns.github.io/)
- [Budget App Design Tips](https://www.eleken.co/blog-posts/budget-app-design)
- [Financial Charts Visualization](https://www.syncfusion.com/blogs/post/financial-charts-visualization)
- [Fintech Brand Colors Guide](https://www.patrickhuijs.com/blog/fintech-brand-colors-guide)
- [PrimeVue Component Library](https://primevue.org/)
- [Expense Dashboard Examples](https://www.quantizeanalytics.co.uk/expense-dashboard-examples/)
- [Color Psychology in Financial Apps](https://windmill.digital/psychology-of-color-in-financial-app-design/)
