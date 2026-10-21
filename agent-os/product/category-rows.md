# Lignes de catégories : une figure, un graphique, un état

Rédigé le 2026-10-22. Aucune branche ouverte. Fait suite à l'[audit UX d'octobre](../local/audit-ux-2026-10-17/README.md) et aux [tendances de dépenses](spending-trends.md). Maquettes validées le 2026-10-21 : https://claude.ai/artifact/6qayafA9JjDQJhnkiLo5Cy (version 2) ; notes de travail dans `agent-os/local/proposition-lignes-categories-2026-10-21.md`.

## Le problème

Deux listes montrent les catégories de dépenses ligne par ligne : « Détail par catégorie » du tableau de bord (`CategoryBreakdownList.vue`) et le tableau des enveloppes du budget (`BudgetCategoryRow.vue`, en-tête dans `BudgetPage.vue`). Sur les deux, les données de droite ne s'alignent pas et la courbe ne dit pas grand-chose.

| Défaut                            | Tableau de bord                                                                                                                 | Budget                                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pas de colonnes                   | Une carte flex par ligne : le bloc de droite se cale sur la largeur de ses propres textes                                       | Chaque ligne est **sa propre grille** avec des pistes `auto` (`rowGridTemplate`) : la largeur d'une colonne est recalculée ligne par ligne. « 500,00 € » et « 247,00 € » ne sont pas alignés |
| Lien dans le nombre               | Flèche après le bloc des montants                                                                                               | Jusqu'à trois flèches inline après les montants : le bord droit bouge                                                                                                                        |
| Trop de nombres pour une grandeur | Moyenne, total, pourcentage : trois nombres pour une seule grandeur, plus « dont exceptionnel »                                 | Budget, réel, « hors », « lissés », en deux couleurs de colonne                                                                                                                              |
| Courbe normalisée ligne par ligne | Min/max propres, sans zéro : un poste constant dessine une falaise, « Dons » (15 € un seul mois) a la courbe la plus dramatique | Même composant, même défaut, et l'enveloppe n'y figure pas                                                                                                                                   |
| Rouge partout                     | Douze courbes rouges : la couleur d'état « dépassé » appliquée à tout                                                           | Réel en rouge sur toutes les lignes, le badge reste le seul vrai indicateur                                                                                                                  |

## Ce que chaque liste sert

La forme suit l'usage. Une liste a une raison d'être ouverte, et la ligne ne porte que ce qui y répond.

**Tableau de bord.** La page répond à « où part mon argent sur la période ». La liste sert à hiérarchiser les postes, à retenir un ordre de grandeur mensuel (« l'alimentation, c'est 470 € par mois », le chiffre que le budget reprend comme Historique), à vérifier d'un coup d'œil que c'est stable, et à creuser. Ce qui bouge est déjà raconté par « Ce qui change » au-dessus.

**Budget.** Deux visites. La fréquente : « est-ce que je tiens mes enveloppes, lesquelles lâchent, et chaque mois ou seulement en moyenne ? ». La rare : fixer une enveloppe, le seul moment où trois nombres par ligne se justifient.

**Règle retenue : par ligne, une figure, un graphique, un état.** Tout le reste descend dans la ligne dépliée, qui existe déjà. Rien n'est supprimé, tout est déplacé.

| Donnée                           | Tableau de bord                                                        | Budget (suivi)                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| La figure                        | Moyenne par mois                                                       | Réel à date, avec « sur 500 € » dessous                                                         |
| Le graphique                     | Courbe base zéro, trait neutre, pointillé = la moyenne affichée        | Colonnes mensuelles du plan, pointillé = l'enveloppe, mois au-dessus en rouge                   |
| L'état                           | Barre de part (échelle commune, couleur du donut, événements hachurés) | Badge « Dépassé » / « Couvert » existant ; chiffres en encre neutre                             |
| Part en %, total, nombre de mois | Ligne dépliée, première ligne de faits                                 | —                                                                                               |
| « dont / hors exceptionnel »     | Portion hachurée de la barre ; chiffre et lien en dépliant             | Ligne dépliée, avec son lien                                                                    |
| « dont lissés »                  | —                                                                      | Ligne dépliée                                                                                   |
| % consommé, écart                | —                                                                      | Aucun chiffre : « 465 sur 500 » le dit, les tuiles Reste / Marge le chiffrent en dépliant       |
| Liens vers les transactions      | Une flèche en dernière colonne (la catégorie sur la période)           | Une flèche en dernière colonne (la fenêtre de la figure) ; historique et événements en dépliant |

## Décisions prises

- **Une grille par tableau, pas par ligne.** Le conteneur porte `grid-template-columns`, l'en-tête et chaque ligne sont des enfants `col-span-full grid grid-cols-subgrid` (Tailwind 4). Les pistes `auto` se calculent alors sur toutes les lignes : c'est le correctif racine. Sous `sm`, la ligne garde sa propre grille à trois colonnes comme aujourd'hui.
- **`SparklineChart` reste un composant, reparamétré par options.** Nouvelles props `baseline: 'min' | 'zero'` (défaut `min`, le comportement actuel), `reference?: number` (une ligne pointillée horizontale), `endColor?: string`, `label?: string` (le `aria-label`, sinon `aria-hidden`). Les deux listes passent `baseline="zero"` et le trait neutre ; `SpendingTrendTile` ne change pas.
- **Un nouveau mini-graphique pour le budget, `MonthsVsBudgetChart.vue`, en SVG pur.** Pas d'ApexCharts dans une ligne : onze instances d'Apex par page ont un coût de rendu et le graphique est trop petit pour un tooltip. Props : `values`, `months` (`YYYY-MM`), `budget`, `runningMonth?` (plus clair, incomplet), `selectedMonth?` (surligné en mode mois isolé), `label`. Un mois au-dessus de l'enveloppe en rouge d'état, les autres en gris neutre, l'enveloppe en pointillé dans l'encre du texte. Sans enveloppe (`budget` à 0) : colonnes seules, pas de ligne.
- **Les mois du graphique budget sont les mois du plan déjà commencés** (`startedPlanIndices` de `useBudgetComparison`, à exporter), pas toute la fenêtre des statistiques comme la sparkline actuelle. En mode édition, `budget` est déjà la valeur du brouillon : la ligne pointillée suit la saisie sans rien de plus.
- **Couleurs.** Trait et colonnes en `gray-500` clair / `slate-400` sombre (ceux de `labelColor` dans `useChartTheme`), point final et ligne d'enveloppe dans l'encre du texte, rouge `red` uniquement pour un mois au-dessus. Le tableau de bord teinte la barre de part avec `colors` (déjà passé au composant, les couleurs du donut).
- **Texte en encre de texte.** Plus de Budget en vert ni de Réel en rouge : l'en-tête perd ses couleurs de colonne, la figure est en gras, la référence en petit gris. L'état est porté par le badge et par le graphique.
- **Le mois en cours sur le budget.** En mode mois isolé et mois courant, l'annotation garde « sur 500 € » et la ligne existante « 290 € à ce jour » (`budget-prorata-*`), puisque c'est la référence juste d'un mois incomplet. C'est la seule ligne à deux références.
- **La colonne Historique n'est pas réservée à l'édition.** Elle s'affiche quand une comparaison est choisie (`comparisonRange`), ce qui est une demande explicite de l'utilisateur ; elle reste, en encre neutre, avec « Reprendre » en édition. Son lien passe dans la ligne dépliée.
- **Identifiants de test conservés.** `category-row-*`, `category-link-*`, `budget-row-*`, `budget-value-*`, `budget-input-*`, `budget-prorata-*`, `budget-exceptional-*`, `budget-amortized-*`, `budget-actual-link-*`, `budget-historical-link-*` gardent leur nom ; ceux dont l'élément descend dans la ligne dépliée ne sont présents que dépliés, et les tests s'adaptent.

## Lots

### Lot 0 : la grille partagée et le sparkline reparamétré

Le socle commun, sans changer ce que les lignes affichent.

- `SparklineChart.vue` : props `baseline`, `reference`, `endColor`, `label` ; `aria-label` quand `label` est donné, `aria-hidden` sinon ; remplissage de zone à 0,07 en base zéro (à 0,14 il fait un bloc). Tests : base `min` identique à aujourd'hui, base `zero` avec une série constante donne une ligne horizontale, `reference` trace une ligne à la bonne hauteur, série de moins de deux points ne rend rien.
- `MonthsVsBudgetChart.vue` (nouveau, `components/budget`) : SVG, une colonne par mois, ligne d'enveloppe, mois au-dessus en rouge, mois en cours atténué, mois sélectionné surligné, `aria-label` en toutes lettres (« 5 mois, 2 au-dessus de l'enveloppe de 133 €, octobre en cours »). Tests sur les classes et attributs des `rect` et de la `line`.
- `useBudgetComparison.ts` : exporter `startedPlanIndices` et une aide `startedPlanMonths` (les `YYYY-MM` correspondants). Test.
- Budget : la grille passe au conteneur. Dans `BudgetPage.vue`, l'en-tête et la liste deviennent les enfants d'un seul `grid` dont le template est `rowGridTemplate` ; `BudgetCategoryRow.vue` rend sa ligne en `col-span-full sm:grid-cols-subgrid` et son panneau déplié en `col-span-full`. Rien d'autre ne bouge dans ce lot ; le test de `BudgetPage.spec.ts` vérifie que l'en-tête et les lignes partagent le même template.
- Vérification : `pnpm --filter frontend test`, `pnpm --filter frontend type-check`, `pnpm --filter frontend lint`, puis un œil sur la page budget en local : les colonnes Budget et Réel tombent sur la même verticale sur toutes les lignes.

### Lot 1 : le tableau de bord

`CategoryBreakdownList.vue` passe de cartes à un tableau, et la ligne se réduit à nom · part · courbe · moyenne · lien.

- Un conteneur `grid` avec en-tête (« Catégorie », « Part des dépenses », « Tendance · N mois · - - moyenne », « Moyenne par mois »), les lignes en `subgrid` ; fini les cartes séparées par 6 px, une ligne de séparation `divide-y` comme le budget. Le bouton de dépliage reste sur le nom, l'`aria-expanded` et le focus visible (point 4 de l'audit) sont conservés.
- Colonne Part : une barre dont la piste est pleine pour la plus grosse catégorie de la liste (échelle commune), remplie avec `colors.get(cat.category)` (gris « Autres » au-delà du top du donut), la portion événements en hachuré (`exceptionalAmount / amount` de la part). Le pourcentage reste en `title` et dans le `aria-label` de la barre ; il n'est plus écrit dans la ligne.
- Colonne Tendance : `SparklineChart` en `baseline="zero"`, `reference` = la moyenne affichée, largeur 130, trait neutre, `label` en toutes lettres. Masquée sous `sm` comme aujourd'hui.
- Colonne Moyenne : la figure seule, « /mois » en petit. Sur une période d'un mois (`averagePerMonth` absent) la figure est le montant, sans unité, comme aujourd'hui.
- Dernière colonne : `TransactionsLink` de la catégorie, hors du bouton (déjà le cas).
- Ligne dépliée : une première ligne de faits avant les sous-catégories, « Total sur N mois : 4 260,48 € · Part : 12,3 % · Événements : 426,65 € (inclus / exclus de la moyenne) → voir ». Elle absorbe la ligne « Événements exceptionnels » existante. Sous-catégories, graphique Apex et remboursements inchangés.
- Téléphone : nom et moyenne sur une ligne, la barre de part dessous sur toute la largeur (elle remplace le pourcentage qui passait à la ligne).
- Tests `CategoryBreakdownList.spec.ts` : la part se lit dans le `title` / `aria-label` de la barre et non plus dans le texte de la ligne ; « Total » et « dont / hors » ne sont présents qu'une fois la ligne dépliée ; la plus grosse catégorie a une barre à 100 % ; la portion hachurée correspond à la part des événements ; un mode sans `colors` rend une barre grise. `DashboardPage.spec.ts` ne regarde pas ces textes.
- Vérification : tests, type-check, lint, et la page en local dans les deux lectures (Tout / Vie courante) : la barre et la figure changent ensemble quand une catégorie porte des événements.

### Lot 2 : le budget

`BudgetCategoryRow.vue` adopte la ligne nom · réel sur enveloppe · mois contre l'enveloppe · lien, et le mode édition garde ses trois nombres.

- Colonnes en mode suivi : Catégorie · [Historique] · Réel à date · Mois du plan · lien. La colonne Budget disparaît de la ligne : l'enveloppe est l'annotation « sur 500 € » sous le réel (`budget-value-*` reste sur ce `span`), « sans enveloppe » quand elle vaut 0. Quand la colonne Réel est absente (plan futur, sans mois commencé), la figure est l'enveloppe seule, comme aujourd'hui le Budget.
- En-tête : « Réel à date · moyenne sur N mois complets » ou « Réel · octobre 2026 » (`actualPeriodLabel` existant) ; « Mois du plan · juin → octobre · - - enveloppe ». Plus de couleur de colonne.
- Colonne Mois du plan : `MonthsVsBudgetChart` sur `startedPlanMonths`, `values` découpées dans `seriesFor(cat)` aux mêmes indices, `budget` = l'enveloppe (brouillon en édition), `runningMonth` = le mois courant, `selectedMonth` = le mois isolé le cas échéant. Masquée sous `sm` en v1 du lot ; à réévaluer à 160 px de large, la maquette la montre tenable.
- Dernière colonne : un seul `TransactionsLink`, celui de la fenêtre de la figure (`actualWindow`, sinon `historicalWindow`), `data-testid` `budget-actual-link-*` conservé.
- Annotations : « hors / dont X € d'événements » (`budget-exceptional-*`), « dont X € lissés » (`budget-amortized-*`) et le lien Historique descendent dans la ligne dépliée, sous les tuiles Reste / Marge, chacune avec son lien. Le prorata « à ce jour » reste sous la figure, en mois isolé et courant seulement.
- Mode édition : Catégorie · [Historique + Reprendre] · champ Enveloppe · Réel + Reprendre · Mois du plan. Le champ remplace l'annotation ; la ligne pointillée du graphique suit la saisie (déjà le cas par la prop `budget`). Le « était 133 € » barré sous le champ reste.
- Badges « Dépassé » / « Couvert » inchangés (`getRowStatus`).
- Téléphone : nom et badge, « réel sur enveloppe » à droite, les libellés `sm:hidden` existants mis à jour.
- Tests `BudgetPage.spec.ts` : `budget-exceptional-*` et `budget-amortized-*` ne sont présents qu'une fois la ligne dépliée ; `budget-value-*` lit « sur 500 € » ; le graphique reçoit les mois commencés du plan et l'enveloppe du brouillon en édition ; mode mois isolé : `selectedMonth` passé, prorata affiché ; plan sans mois commencé : pas de graphique, figure = enveloppe. Nouveaux tests unitaires de `BudgetCategoryRow` sur la projection des props vers le graphique.
- Vérification : tests, type-check, lint ; la page en local en suivi, en mois isolé (`Réel · octobre`), en comparaison (« Comparer avec… ») et en édition ; sur chaque ligne la figure, le graphique et le badge racontent la même chose.

## Hors périmètre

- La colonne « Tendance » de `SpendingTrendTile` et les couleurs par teinte des tendances : elles gardent la base min/max, à revoir dans un lot à part si la base zéro s'impose partout.
- La matrice mensuelle du budget (`BudgetMonthlyMatrix`) et la liste de la page d'une étiquette (`TagAnalysisPage`, « Détail par catégorie ») : d'autres tableaux, mêmes principes, un chantier suivant.
- Le contraste de `primary` et le quatrième onglet, décisions ouvertes de l'audit UX.
