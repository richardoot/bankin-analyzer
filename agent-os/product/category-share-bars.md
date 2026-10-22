# Détail par catégorie : la part en barres, le donut retiré

Rédigé le 2026-10-23. Fait suite aux [lignes de catégories](category-rows.md) (mergé le 2026-10-22, 8a5c20b). Maquettes validées le 2026-10-23 : https://claude.ai/artifact/Kd7EECcXdkHtZT9HrHb5ke (4 artboards : liste bureau, liste téléphone, ligne dépliée, section Dépenses après).

## Le problème

La colonne « Part des dépenses » du tableau de bord ment sur son nom. La barre est à échelle commune, pleine pour le plus gros poste : Alimentation à 23 % remplit toute la piste. Le pourcentage réel n'est que dans l'infobulle. Et la part est montrée trois fois sur la page : le donut « Dépenses par catégorie », cette barre, et la ligne de faits dépliée.

Les recherches tranchent (Cleveland & McGill, Heer & Bostock, Kosara, Datawrapper, Nielsen Norman Group) : pour comparer des catégories entre elles, des barres triées sur une échelle commune se lisent mieux qu'un donut, qui ne tient qu'avec peu de tranches bien distinctes. Ici il y a douze catégories, deux grosses et dix petites. La liste est donc le bon graphique de parts, à condition que la barre soit proportionnelle au total, que son pourcentage soit écrit, et que le total soit dans l'en-tête.

## Décisions prises

- **La barre est proportionnelle au total de la période** (`displayedTotalExpenses`, celui déjà passé en prop `total`), plus au premier poste. Le pourcentage est écrit au bout de la barre, en petit gris. L'en-tête dit « Part des dépenses · sur 18 131 € ».
- **Une seule teinte pour toutes les barres.** La longueur porte la grandeur, l'emoji et le nom portent l'identité. Les couleurs du donut étaient attribuées par rang, elles changeaient avec la période et n'identifiaient rien. Teinte retenue : `blue-400` (`#60a5fa`) dans les deux thèmes, la piste `gray-100` clair / `slate-800` sombre. Les événements restent hachurés au bout de la barre, à leur vraie échelle (part de `exceptionalAmount` dans le montant), en lecture réelle seulement.
- **L'emoji reste, la pastille de couleur disparaît.** Elle reliait au donut ; sans donut elle ne relie plus rien.
- **Le donut « Dépenses par catégorie » est retiré**, avec la prop `colors` de la liste et la palette par rang (`assignCategoryColors`, `DONUT_TOP_N`) côté dépenses. Le donut des revenus reste : il n'a pas de liste à côté.
- **Le sélecteur de catégorie de « Dépenses par mois » est retiré** : la ligne dépliée fait ce travail. Le graphique garde le clic par mois et le lien « transactions de la période ».
- **La ligne dépliée** : faits (total sur N mois, nombre de transactions, événements avec lien), sous-catégories avec une barre relative à la catégorie et son pourcentage, graphique mensuel avec la moyenne en pointillé et la part des événements empilée en hachuré, remboursements inchangés. La part de la catégorie sort de la ligne de faits : elle est écrite sur la barre.
- **Les événements par mois viennent du backend** : nouveau champ `exceptionalMonthlyAmounts` sur `CategoryDataDto`, aligné sur `monthLabels`, présent aux mêmes conditions que `exceptionalAmount`. Le frontend ne le reconstitue pas par soustraction, les tranches lissées fausseraient le calcul.
- **Règle inchangée** : une figure, un graphique, un état par ligne. Le pourcentage est l'étiquette de la barre, pas une seconde figure. Pas d'écart au mois précédent dans la ligne, c'est le rôle de « Ce qui change ».
- **Identifiants de test conservés** : `category-row-*`, `category-link-*`, `category-share-*`, `category-share-fill-*`, `category-share-events-*`, `category-average-*`, `category-panel-*`, `category-facts-*`, `category-exceptional-link-*`, `expense-category-filter` (supprimé avec le sélecteur), `category-color-*` (supprimé avec la pastille).

## Lots

### Lot 0 : les événements par mois (backend)

- `backend/src/dashboard/dto/dashboard-summary-response.dto.ts` : `exceptionalMonthlyAmounts?: number[]` sur le DTO de catégorie, documenté comme `everydayMonthlyAmounts`.
- `backend/src/dashboard/dashboard.service.ts` : le remplir là où `exceptionalAmount` et `everydayMonthlyAmounts` sont calculés (autour des lignes 877-900), par mois de `breakdownMonthLabels`, à partir des mêmes transactions d'événements. Absent quand `exceptionalAmount` l'est. Arrondi comme les autres montants.
- `frontend/src/lib/api.ts` : le champ sur `CategoryDataDto`.
- Tests : `dashboard.service.spec.ts`, un cas avec un événement sur un mois, les autres mois à 0, la somme égale à `exceptionalAmount` ; un cas sans événement, champ absent.
- Vérification : `pnpm --filter backend test`, `pnpm --filter backend lint`, type-check frontend.

### Lot 1 : la ligne repliée

`CategoryBreakdownList.vue` et sa spec.

- `barWidth` devient la part du total (`displayedAmount / total`), plus du plus gros poste ; `largestAmount` disparaît. Largeur minimale visuelle 3 px pour qu'un poste à 0,1 % existe.
- Le pourcentage s'écrit après la barre dans un `span` de 46 px, `tabular-nums`, `text-xs`, gris ; `data-testid="category-share-pct-*"`. Il reste aussi dans `title` et `aria-label`.
- En-tête : « Part des dépenses · sur {{ total }} » (devise entière), « Tendance · N mois · ┄ moyenne », « Moyenne par mois ».
- Teinte unique : `barColor` rend `#60a5fa` ; la prop `colors` et `othersColor` sortent du composant. La pastille `category-color-*` et son `span` sortent du bouton. L'emoji reste.
- Piste de la grille : la colonne part passe de `minmax(4rem, 11rem)` à `minmax(6rem, 15rem)` pour loger barre + pourcentage.
- Téléphone : barre et pourcentage sur la deuxième ligne, pleine largeur, pourcentage à droite.
- Tests : la plus grosse catégorie n'est plus à 100 % mais à sa part ; le pourcentage est dans le texte de la ligne (`category-share-pct-*`) ; la somme des largeurs vaut 100 % à l'arrondi près ; plus de `category-color-*` ; le hachuré vaut `exceptionalAmount / amount` en lecture réelle et 0 en Vie courante ; l'en-tête porte le total.
- `DashboardPage.spec.ts` : le test de la pastille (ligne 467) est remplacé par un test sur l'emoji ou supprimé.
- Vérification : tests, type-check, lint, et la page en local dans les deux lectures.

### Lot 2 : la ligne dépliée

`CategoryBreakdownList.vue`, `MonthlyBarChart.vue` et leurs specs. Dépend du lot 0.

- Ligne de faits : « Total sur N mois : X · N transactions · Événements : X (inclus / exclus de la moyenne) Voir → ». La part en sort. `transactionCount` vient du DTO, déjà transporté.
- Sous-catégories : une colonne barre + pourcentage, relative au montant de la catégorie (`subcategoryAmount / displayedAmount`), même teinte, même hachuré si la sous-catégorie porte des événements (le DTO de sous-catégorie n'a pas `exceptionalAmount` aujourd'hui : pas de hachuré en v1, à ajouter au DTO plus tard si utile). Colonnes : nom · barre + % · N tx · montant · /mois · lien. Identifiants `subcategory-share-*`.
- `MonthlyBarChart.vue` : deux nouvelles props optionnelles, `reference?: number` (une ligne pointillée horizontale, annotation Apex `yaxis`, dans l'encre du texte) et `overlay?: number[]` (une seconde série empilée, même teinte avec motif hachuré via `fill.pattern` d'Apex, légende « événements »). Sans `overlay` ni `reference`, rendu identique à aujourd'hui : « Dépenses par mois » et « Revenus par mois » ne changent pas.
- La liste passe `reference` = la moyenne affichée, et `overlay` = `exceptionalMonthlyAmounts` en lecture réelle (la série principale devenant `everydayMonthlyAmounts` pour que l'empilement fasse le total), rien en Vie courante. L'infobulle d'un mois dit « X, dont Y d'événements ».
- Tests : faits sans « Part » ; sous-catégories avec une barre dont la somme vaut 100 % ; `MonthlyBarChart` reçoit `reference` et `overlay` en lecture réelle, pas `overlay` en Vie courante ; `MonthlyBarChart.spec.ts` sur l'annotation et la seconde série.
- Vérification : tests, type-check, lint, la ligne Logement dépliée en local dans les deux lectures.

### Lot 3 : la page

`DashboardPage.vue`, `useDashboardData.ts` et leurs specs.

- Retirer la carte « Dépenses par catégorie » (lignes 704-731) et `CategoryPieChart` côté dépenses ; `DONUT_TOP_N`, `categoryColors`, `assignCategoryColors` et le `colors` passé à la liste sortent, ainsi que `openCategories` s'il ne sert qu'au donut. Le donut des revenus reste.
- Retirer le sélecteur `expense-category-filter` de « Dépenses par mois » et `selectedCategory` avec sa logique de série ; le graphique montre toutes les dépenses, clic par mois et lien conservés.
- La carte « Détail par catégorie » prend la largeur libérée ; vérifier la grille de la section.
- `DashboardPage.spec.ts` : les tests du donut des dépenses (lignes 706-740) passent au seul donut des revenus ; les tests du sélecteur sont retirés.
- Vérification : tests, type-check, lint, la page entière en local, bureau et téléphone, les deux lectures, et un œil sur `TagAnalysisPage` qui monte aussi `CategoryBreakdownList` (sans `colors` : rien ne doit changer sinon la barre).

## Hors périmètre

- Les couleurs par étiquette du bandeau « Événements de la période » : ce sont les couleurs des étiquettes, pas celles du donut.
- Le donut des revenus et une éventuelle liste des revenus.
- La ligne dépliée de `TagAnalysisPage`, qui réutilise le composant et en hérite.
- Un hachuré par sous-catégorie (demande `exceptionalAmount` sur `SubcategoryDataDto`).
