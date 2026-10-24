# Refonte du tableau de bord : le mois d'abord, le détail à la demande

Rédigé le 2026-10-24. Fait suite au rapport [Tableau de bord : à quoi il répond, ce qu'il montre, ce qu'il faudrait changer](../local/dashboard-lecture-2026-10-23.md) (recherche documentaire, inventaire, diagnostic) et aux cadrages des cartes qu'il réorganise : [tendances](spending-trends.md), [barres de part](category-share-bars.md), [épisodes](episodes-of-year.md), [lignes de catégories](category-rows.md). Maquettes validées le 2026-10-23 : https://claude.ai/artifact/SV4RH3eRSrwGDaBvAULXEk (six artboards : A « Le mois d'abord » retenue, B et C écartées, A sur téléphone, A avec les lignes Plaisir et Événements dépliées, la liste en douze lignes avec tendance sur les gros postes).

## Le problème

Chaque carte du tableau de bord est argumentée dans son cadrage, et la page est pourtant dure à lire. Le rapport en donne les causes, résumées ici :

- **Trois horloges** sur une page : la période des filtres, le dernier mois clos des tendances, l'année civile des épisodes. Chaque carte s'excuse dans son sous-titre de ne pas suivre le réglage du haut.
- **Les réglages avant les chiffres** : 320 px d'interrupteurs et trois phrases d'explication avant le premier montant.
- **Les redites** : l'épargne dite trois fois, l'engagé trois fois, le total quatre fois, les événements deux fois.
- **Des moyennes là où la question est « maintenant »**, faussées par le mois en cours compté comme un mois plein (`periodMonths = monthlyData.length`) : au 23 octobre, le revenu moyen affiché est 2 289 € au lieu de 2 497 € sur les mois clos.
- **Une carte qui est une page** (« Ce qui change », six contrôles, seize tendances en septembre), **des graphiques vides** (donut des revenus à 99,5 % / 0,5 %), **six systèmes de couleur**, 120 chiffres et 40 mini-graphiques, 8 500 px sur téléphone.

Ce que la recherche fait converger (CFPB, Levi, Carlin-Olafsson-Pagel, Few, NN/g, et les accueils documentés de Copilot, Lunch Money, YNAB, Monzo, Bankin) : quatre à six blocs, une question par bloc, dans l'ordre des visites. Combien puis-je encore dépenser ce mois-ci ; suis-je dans mon rythme ; qu'est-ce qui arrive ; qu'est-ce que je dois faire ; où part l'argent et qu'est-ce qui change ; et seulement sur une autre page, ce qu'un épisode a coûté.

## Décisions prises

- **La maquette A.** Quatre bandes dans l'ordre des questions : **Ce mois-ci** (vie courante contre l'habitude, revenus, à venir, reste à vivre), **Ce qui change** (la phrase et trois tuiles), **À faire**, **Où part l'argent** (la période, la structure en deux lignes, un graphique revenus et dépenses, la liste des catégories, trois lignes de résumé). Deux horloges au lieu de trois : le mois en cours pour les trois premières bandes, la période pour la quatrième, et la période ne gouverne que la section qui la nomme.
- **« Ce mois-ci » lit le mois en cours à date**, pas le dernier mois clos : la bande dit « octobre, au 23 », l'habitude est ramenée au prorata des jours pour que l'écart ait un sens, et le mois en cours n'entre dans aucune moyenne.
- **L'habitude est la médiane des six mois clos précédents**, la même que « Ce qui change » (fenêtre 6 par défaut, `trend.detection.ts`). Un chiffre, une définition.
- **Les réglages sortent de la page** : un menu « Lecture ▾ » en haut à droite porte la bascule Vie courante / Tout, les deux interrupteurs de remboursements et leurs explications. Son bouton affiche l'état en une ligne. Défauts inchangés : vie courante, remboursements reçus et en attente déduits.
- **La période par défaut devient 12 mois** (`1y`, libellé « 12 mois ») au lieu de « Tout » ; une préférence déjà enregistrée est respectée. Le sélecteur descend en tête de « Où part l'argent ».
- **Douze catégories, pas sept.** La liste reste complète ; la sparkline n'apparaît que sur les postes à 5 % du total et plus, et toujours dans la ligne dépliée.
- **Le détail se déplie en place, jamais dans un onglet.** Les lignes Essentiel, Plaisir, Engagé et Variable s'ouvrent sur leur composition par catégorie, leur part par mois et le lien vers les transactions filtrées (filtres `nature` et `rhythm`, déjà acceptés par la page Transactions). La ligne « N événements sur la période » s'ouvre sur le tableau des étiquettes (famille, montant, analyse, transactions). Deux niveaux au plus (Nielsen) : au-delà, c'est une page.
- **Trois pages d'exploration, pas de nouvel onglet sur le tableau de bord** : `/trends` reçoit la carte complète « Ce qui change » ; la page Étiquettes reçoit la carte « Épisodes de l'année » en tête ; Transactions reste la liste.
- **Un seul graphique mensuel** : les dépenses en colonnes (vie courante en plein, le reste hachuré, comme la ligne dépliée le fait déjà), les revenus en ligne, l'habitude en pointillé, le mois en cours plus clair. Il remplace « Dépenses par mois », « Revenus par mois » et son sélecteur, et le donut des revenus. Le revenu par source devient une ligne de texte, ou une barre de part si une seconde source dépasse 5 %.
- **Les chiffres en encre de texte**, comme déjà décidé pour les listes. La couleur ne porte que l'état (l'écart à l'habitude, un dépassement) ; l'ambre est réservé à « À faire » ; une seule teinte de donnée, le `blue-400` des barres de part.
- **« À faire » se compose côté frontend** à partir de ce que le résumé et les tendances exposent déjà : lignes à classer (tendance `uncategorized`), avancés en attente (`pendingReceivables`), enveloppe dépassée (`remaining < 0` d'une famille), abonnement apparu, arrêté ou dont le prix a changé (tendances `subscription`, `price`), lignes « à migrer » (`unknownNature > 0`). Quatre lignes, puis « et N autres » ; la carte disparaît quand elle est vide.
- **Ce qui disparaît du tableau de bord** : la carte de filtres, les trois KPI « moyens / mois », les contrôles et les onglets de « Ce qui change », la carte « Structure des dépenses » et sa liste de définitions, la carte « Épisodes de l'année », le graphique « Dépenses par mois » seul, l'encadré ambre des événements, la section « Revenus » entière. Rien n'est perdu : chaque donnée a sa nouvelle place, dite lot par lot.
- **Identifiants de test** : ceux des composants déplacés suivent leurs composants (`spending-trends`, `trend-*`, `tag-families-of-year`, `family-of-year-*`, `category-*`, `subcategory-*`). Ceux de la page (`kpi-card-*`, `dashboard-filters-card`, `dashboard-breakdown-mode`, `toggle-deduct-*`, `spending-structure`, `axis-*`, `savings-reading`, `income-category-filter`, `dashboard-income-section`) sont remplacés par ceux des nouvelles bandes, nommés dans les lots.

## Les lots

Chaque lot est livrable seul et laisse la page cohérente. L'ordre est celui des dépendances. Les tests sont à écrire avant de passer au lot suivant (CLAUDE.md).

### Lot 0 : les réglages, la période, les mois clos

`frontend/src/stores/filters.ts`, `frontend/src/components/filters/TimePeriodSelector.vue`, `frontend/src/views/DashboardPage.vue`, `frontend/src/composables/useDashboardData.ts`, `backend/src/dashboard/dashboard.service.ts`, et leurs specs.

- **Menu « Lecture »** : nouveau `components/dashboard/ReadingMenu.vue`. Un bouton `btn` en tête de page, `aria-haspopup="menu"`, dont le libellé dit l'état : « Lecture : vie courante · remboursements déduits ». Il ouvre un panneau (le motif popover des étiquettes sur bureau, une feuille `BaseModal` sous `sm`) contenant le `SegmentedControl` Vie courante / Tout, les deux `ToggleSwitch`, la phrase qui distingue la préférence enregistrée de la lecture locale, et l'`InlineAlert` `dashboard-pending-sync-error`. La logique ne bouge pas : `breakdownMode` reste dans `useDashboardData` (localStorage), les interrupteurs dans le store. Identifiants : `reading-menu`, `reading-menu-button`, `breakdown-mode-*` et `toggle-deduct-*` conservés dans le panneau.
- **La carte de filtres disparaît** (`dashboard-filters-card`). La note sur les achats lissés (`dashboard-amortized-note`) passe dans le panneau du menu.
- **La période** : `TimePeriodSelector` est monté dans l'en-tête de la section « Où part l'argent » (lot 4 lui donne sa place définitive ; en attendant, au-dessus de la section Dépenses). Libellé de `1y` : « 12 mois » (`shortLabel` « 12M »). Défaut du store : `'1y'` ; la préférence serveur, si elle existe, prime comme aujourd'hui.
- **Les mois clos** : le backend calcule `periodMonths` comme le nombre de mois de la période **antérieurs au mois en cours** (au moins 1), et divise par lui les `averagePerMonth` et `everydayAveragePerMonth` (`dashboard.service.ts` lignes 170-190 et 816-904, `periodMonthsCount`). Le mois en cours reste dans `monthlyData` et `monthlyAmounts` (les graphiques le dessinent), hors des moyennes. Le DTO documente la règle. Le frontend lit `periodMonths` du DTO au lieu de `monthlyData.length` ; les KPI, tant qu'ils existent, le disent (« sur 11 mois clos »).
- Tests : `filters.spec.ts` (défaut `1y`, préférence respectée) ; `ReadingMenu.spec.ts` (état dans le libellé, les trois commandes, l'alerte) ; `dashboard.service.spec.ts` (une période finissant dans le mois en cours divise par les mois clos ; une période entièrement passée divise par tous ses mois ; une période réduite au mois en cours divise par 1) ; `useDashboardData.spec.ts` (`periodMonths` lu du DTO).
- Vérification : `pnpm --filter backend test`, `pnpm --filter frontend test`, type-check (`vue-tsc --build`), lint, la page en local dans les deux lectures.

### Lot 1 : la bande « Ce mois-ci »

Backend : `backend/src/dashboard/dashboard.service.ts`, `dashboard.controller.ts`, nouveau DTO `dto/dashboard-month-response.dto.ts`. Frontend : nouveau `components/dashboard/MonthBand.vue`, nouveau composable `useMonthData.ts`, `DashboardPage.vue`, `lib/api.ts`.

- **Une requête à part**, `GET /dashboard/month`, parce que la bande ne dépend pas de la période : paramètres `reading` (`everyday` | `real`), `deductReimbursements`, `deductPendingReimbursements`, `asOf` (date, défaut aujourd'hui, pour les tests). Réponse `DashboardMonthDto` :
  - `month` (`YYYY-MM`), `asOfDay`, `daysInMonth` ;
  - `spent` : les dépenses nettes du mois à date dans la lecture (vie courante : `everydayNetExpenses` ; tout : `netExpenses`), `spentSeries` : les six mois clos précédents puis le mois en cours, même lecture ;
  - `habit` : la médiane des six mois clos précédents (réutiliser la fonction de médiane de `trend.detection.ts`, exportée), `habitToDate` = `habit × asOfDay / daysInMonth`, `habitMonths` : combien de mois clos ont servi (moins de 3 : `habit` est `null` et la bande dit qu'il manque de l'historique, comme les tendances) ;
  - `incomeReceived` : les revenus du mois à date ; `incomeExpected` : la médiane des revenus des six mois clos précédents ; `incomeSeries` : six mois clos ;
  - `upcoming` : les récurrences `ACTIVE` (`app.recurrences`) dont `nextExpected` tombe entre `asOf` et la fin du mois, chacune `{ id, name, amount, nextExpected, categoryId }`, triées par date ; `upcomingTotal` ;
  - `remainingToLive` = `incomeExpected − spent − upcomingTotal`, `null` si `incomeExpected` l'est ; `remainingShare` = part du revenu attendu.
  - Conventions reprises de la requête 1 du résumé : comptes exclus ignorés, part du compte joint, remboursements selon les deux paramètres, étiquettes exceptionnelles hors vie courante, achats lissés par tranches en vie courante.
- **`MonthBand.vue`** : une carte `BaseCard` « Ce mois-ci · octobre, au 23 », sous-titre « L'habitude est la médiane des six mois clos précédents », une grille de quatre tuiles (`md:grid-cols-4`, `grid-cols-2` sous `md`) :
  - **Vie courante** (ou **Dépenses** en lecture Tout) : `spent` en grand, badge de l'écart à `habitToDate` (teinte d'état : sous l'habitude en teal, au-dessus en ambre, à ±5 % près neutre), « X attendus au N · Y par mois d'habitude », `SparklineChart` de `spentSeries` avec `reference` = `habit` et `baseline="zero"` ;
  - **Revenus** : `incomeReceived`, badge « X attendus » tant que `incomeReceived < incomeExpected × 0,8`, sinon l'écart ; sparkline de `incomeSeries` ;
  - **À venir** : `upcomingTotal`, badge « N prélèvements d'ici le 31 », les trois premiers noms en petit gris, lien vers `/recurrences` ;
  - **Reste à vivre** : `remainingToLive`, badge « X % du revenu attendu », « Revenus attendus − dépensé − à venir » ; fond teal pâle ; en négatif, chiffre en ambre et badge « dépassé », jamais de rouge.
  - Chiffres en encre de texte, `tabular-nums`. Historique trop court : les tuiles gardent le chiffre, le badge devient « pas encore d'habitude ».
  - Identifiants : `month-band`, `month-tile-spent`, `month-tile-income`, `month-tile-upcoming`, `month-tile-remaining`, `month-badge-*`, `month-sparkline-*`.
- **`useMonthData`** : suit la lecture et les deux interrupteurs, jamais la période ; sa propre requête, envoyée en parallèle du résumé ; erreur rendue dans la carte (« La lecture du mois n'a pas pu être chargée · Réessayer »), jamais à la place de la page.
- **Les trois KPI « moyens / mois » sont retirés** (`kpi-card-*`), ainsi que `expensesSparkline`, `incomeSparkline`, `savingsSparkline`, `averageMonthly*` dans `useDashboardData` s'ils ne servent plus (l'épargne de la période revient en lot 4 dans la ligne Revenus).
- **MCP** : `get_dashboard_summary` n'y touche pas ; un outil `get_month_reading` est noté en hors périmètre.
- Tests : `dashboard.service.spec.ts` sur un ledger (le motif des `ledgers/` des tendances) : la médiane sur six mois clos, le prorata, un mois en cours sans salaire, une récurrence `STOPPED` ignorée, une `ACTIVE` dont `nextExpected` est le mois prochain ignorée, les deux lectures, les remboursements ; `dashboard.controller.spec.ts` sur les paramètres ; `MonthBand.spec.ts` sur les quatre tuiles, les badges, l'historique court, l'erreur ; `DashboardPage.spec.ts` sur la bande en tête et l'absence des KPI.
- Vérification : tests, type-check, lint, la bande en local au jour courant dans les deux lectures et sur téléphone.

### Lot 2 : « Ce qui change » réduit, la page Tendances

`frontend/src/components/dashboard/SpendingTrendsCard.vue`, nouveau `views/TrendsPage.vue`, `router/index.ts`, `components/Navbar.vue`, `DashboardPage.vue`, et leurs specs. Aucun backend.

- **`/trends`** : `TrendsPage.vue` monte `SpendingTrendsCard` tel qu'il est aujourd'hui (sélecteur de mois, fenêtre, onglets, résumé IA, horizons), dans un `PageShell` avec `PageHeader` « Tendances · Ce qui change dans la vie courante ». La lecture et les interrupteurs viennent des mêmes sources que le tableau de bord (`useDashboardData` pour `breakdownMode`, le store pour les remboursements) ; la page porte le même menu « Lecture ». Entrée « Tendances » dans la navbar après « Budget » ; la barre d'onglets mobile ne change pas (« Plus »).
- **Sur le tableau de bord**, `SpendingTrendsCard` reçoit `compact: true` : en-tête « Ce qui change · septembre, contre les 6 mois précédents » et lien « Les N tendances → /trends » (N = `insights.length` hors `uncategorized`) ; la phrase de tête (`headline`, ou le texte du `digest` quand il existe et n'est pas périmé : c'est la meilleure phrase de la page) ; trois `SpendingTrendTile` au plus, les trois premiers par score hors `uncategorized` ; rien d'autre : ni sélecteurs, ni onglets, ni « Voir par groupe », ni bouton de résumé, ni ligne d'horizons, ni note de portée. Historique court : la phrase « Encore N mois… » seule. Rien de notable : `quietSentence` seule.
- La ligne « à classer » (`toFile`) quitte la carte compacte : lot 3.
- Tests : `TrendsPage.spec.ts` (la carte complète, le menu Lecture) ; `SpendingTrendsCard.spec.ts` (mode compact : trois tuiles, pas de contrôles, le lien avec le compte, le résumé en tête quand il existe) ; `DashboardPage.spec.ts` (la carte compacte après la bande du mois) ; `Navbar.spec.ts` (l'entrée).
- Vérification : tests, type-check, lint, les deux pages en local.

### Lot 3 : « À faire »

Nouveau `components/dashboard/TodoCard.vue`, nouveau `lib/todo.ts`, `DashboardPage.vue`, et leurs specs. Aucun backend.

- **`lib/todo.ts`** : une fonction pure `todoItems(summary, trends)` qui rend une liste ordonnée de `{ key, text, amount?, to, testId }` à partir de :
  1. la tendance `uncategorized` : « N lignes à classer » → `trendMonthLink` (le lien actuel de `toFile`) ;
  2. `unknownNature > 0` ou `unknownRhythm > 0` : « X € dans des catégories à migrer » → `/settings/categories/migration` ;
  3. `pendingReceivables > 0` : « X € avancés, en attente de remboursement » → `/reimbursements` ;
  4. chaque famille avec `remaining < 0` : « Voyages : enveloppe dépassée de X € » → `/tags/families/:id` ;
  5. les tendances `subscription` (nouvel abonnement, abonnement arrêté) et `price` : la phrase du serveur raccourcie → `/recurrences`.
     L'ordre est celui-ci ; quatre lignes affichées, puis « et N autres » qui déplie le reste en place.
- **`TodoCard.vue`** : `BaseCard` « À faire », une ligne par item (`todo-item-*`), texte à gauche, lien à droite, zone tapable entière sous `sm`. Pas de graphique, pas de couleur sauf l'ambre du titre. La carte n'est pas rendue quand la liste est vide (`todo-card` absent).
- Dans `SpendingTrendsCard` compact, `toFile`, `trends-to-file*` ne sont plus rendus ; la carte complète (page Tendances) les garde.
- Tests : `todo.spec.ts` (chaque source, l'ordre, le plafond de quatre, la liste vide) ; `TodoCard.spec.ts` ; `DashboardPage.spec.ts` (la carte entre « Ce qui change » et « Où part l'argent », absente quand il n'y a rien à faire).
- Vérification : tests, type-check, lint, la carte en local avec les 8 516 € en attente.

### Lot 4 : « Où part l'argent »

`DashboardPage.vue`, `useDashboardData.ts`, nouveau `components/dashboard/StructureLines.vue`, nouveau `components/charts/IncomeExpensesChart.vue`, `CategoryBreakdownList.vue`, nouveau `components/dashboard/PeriodSummaryLines.vue`, `views/TagsPage.vue`, et leurs specs. Aucun backend.

- **La section** : titre « Où part l'argent · novembre 2025 à octobre 2026 » (la plage de `dateRangeLabel`), `TimePeriodSelector` à droite (lot 0 l'y amène), puis une seule `BaseCard` avec, dans l'ordre : les deux lignes de structure, le graphique, la liste, les trois lignes de résumé. Identifiant `dashboard-where-section`.
- **`StructureLines.vue`** remplace `SpendingStructureCard` : deux lignes « Essentiel N % ▬▬▬ Plaisir N % » et « Engagé N % ▬▬▬ Variable N % » (`track`/`fill` des barres de part, une seule teinte, libellés de 150 px de chaque côté), puis la note « Engagé : X € par mois, dont Y € d'abonnements et charges récurrentes · la liste → /recurrences ». Chaque libellé est un bouton `aria-expanded` (le dépliage est le lot 5 ; en lot 4 les boutons sont des liens vers les transactions filtrées, comme les flèches actuelles). Hors de ce composant : « Mis de côté » (la ligne Revenus ci-dessous), « Reste à vivre » (lot 1), « Avancé, en attente de retour » (lot 3), « Engagé, vie courante » (le montant sur la ligne Engagé). La note « À migrer » reste si `unknownNature > 0`. Identifiants : `structure-lines`, `structure-line-nature`, `structure-line-rhythm`, `structure-link-*` conservés.
- **`IncomeExpensesChart.vue`** : un Apex `bar` empilé + `line`, sur `monthlyData` : série « Vie courante » (`everydayNetExpenses`), série « Hors vie courante » (`netExpenses − everydayNetExpenses`, motif hachuré `fill.pattern` comme la ligne dépliée), ligne « Revenus » (`income`) dans l'encre du texte, annotation `yaxis` de l'habitude (la médiane des six derniers mois clos de la série principale, calculée côté frontend avec la même règle que le lot 1 ou lue de `DashboardMonthDto.habit`), le mois en cours en opacité réduite. Clic par mois → `openMonth` (dépenses) conservé ; lien « transactions de la période » conservé. En lecture Tout, une seule série « Dépenses » pleine. Remplace `MonthlyBarChart` pour les dépenses de la page, « Revenus par mois » et `income-category-filter` ; `MonthlyBarChart` reste pour les lignes dépliées et le Budget.
- **La liste** : `CategoryBreakdownList` reçoit `trendMinShare: 0.05` ; sous ce seuil la cellule Tendance est vide (la sparkline reste dans la ligne dépliée) ; en-tête « Par catégorie · moyenne par mois, sur X € » et « Les 12 catégories, les plus lourdes en tête » ; le sous-titre de deux phrases disparaît ; l'encadré ambre `Événements de la période` disparaît (lot 5 le replie dans la ligne de résumé ; en lot 4, les hachures des barres et la ligne de résumé suffisent). `TagAnalysisPage` ne passe pas le seuil : rien n'y change.
- **`PeriodSummaryLines.vue`** : trois lignes de 13 px sous une bordure :
  - **Revenus** : « X € par mois sur N mois clos · Revenus d'activité 99 %, remboursements 1 % » (`incomeCategoriesDetailed`), puis « épargne Y € par mois, Z % des revenus » (`savings` et `savingsRate` de la période, revenus moins dépenses, la règle produit du 2026-10-21) ; lien « Transactions → » (`incomeLink`). Si une seconde source dépasse 5 %, la composition devient une barre de part à deux teintes de la même famille.
  - **Événements** : « N événements sur la période · X € » (`exceptionalEvents`, `exceptionalEventsTotal`), les trois premiers noms ; bouton « Déplier » inerte en lot 4, actif en lot 5.
  - **Épisodes** : « Épisodes 2026 · X € · Voyages 527 €, Hyrox 526 € » (`tagFamiliesOfYear`) ; lien « Les familles → /tags ». Rendue seulement si `hasExceptionalExpenses` et une famille au moins, comme la carte aujourd'hui.
- **`TagFamiliesOfYearCard` quitte le tableau de bord** et se monte en tête de `TagsPage.vue`, au-dessus de la liste des familles, avec les mêmes données (`tagFamiliesOfYear`, `realExpensesOfYear`, `exceptionalExpensesOfYear` : `TagsPage` appelle le résumé sur l'année civile, `includeCategoryBreakdown: false`).
- **La section « Revenus » disparaît** (`dashboard-income-section`), avec `CategoryPieChart` sur cette page (le composant reste pour `TagAnalysisPage` et `TagFamilyPage`), `selectedIncomeCategory`, `filteredIncomeByMonth`, `incomeSliceIds`, `openCategories` s'il ne sert plus.
- Tests : `StructureLines.spec.ts` (parts, note, liens) ; `IncomeExpensesChart.spec.ts` (trois séries en vie courante, deux en Tout, annotation, clic) ; `CategoryBreakdownList.spec.ts` (le seuil : sparkline présente à 7,7 %, absente à 2,8 %, présente dépliée) ; `PeriodSummaryLines.spec.ts` (les trois lignes, la barre à deux sources, la ligne Épisodes absente sans famille) ; `TagsPage.spec.ts` (la carte en tête) ; `DashboardPage.spec.ts` réécrit sur la nouvelle composition (ordre des quatre bandes, absence des cartes retirées).
- Vérification : tests, type-check, lint, la page entière en local, bureau et téléphone, les deux lectures, 3 mois et Tout, et la page Étiquettes.

### Lot 5 : les dépliages

Backend : `dashboard.service.ts`, `dto/dashboard-summary-response.dto.ts`. Frontend : `StructureLines.vue`, `PeriodSummaryLines.vue`, nouveau `components/dashboard/StructurePanel.vue`, nouveau `components/dashboard/EventsPanel.vue`, `lib/api.ts`, et leurs specs. Dépend du lot 4.

- **Backend, résumé** (`includeCategoryBreakdown: true` seulement) :
  - `structureBreakdown` : pour chacun des quatre segments (`essential`, `pleasure`, `committed`, `variable`), la liste `{ categoryId, category, icon, amount, averagePerMonth }` triée par montant, dans la lecture demandée (vie courante : hors événements, lissés par tranches). La nature vient de la sous-catégorie, sinon de la catégorie, le rythme de la ligne de récurrence puis de la sous-catégorie : les règles de la requête 1, pas de nouvelle règle.
  - `structureShareByMonth` : `{ pleasure: number[], committed: number[] }` alignés sur `monthLabels`, la part en pourcentage de la vie courante du mois (la série que la tendance `share` lit, `trend.detection.ts`, exposée telle quelle).
  - `exceptionalByCategory` : `{ categoryId, category, icon, amount }` des transactions d'événements de la période, triés par montant ; `exceptionalEvents` gagne `familyId` et `familyName`.
- **`StructurePanel.vue`** : s'ouvre sous la ligne de structure quand un des quatre libellés est pressé (`aria-expanded`, `aria-controls`, un seul panneau ouvert par ligne). En-tête : « Plaisir · X € par mois en vie courante · Y € sur N mois · Z € par mois tout compris, événements inclus » et le lien « Toutes les transactions Plaisir → » (`transactionsLink({ nature: 'PLEASURE', ...window, gross: true })`). Deux colonnes sur bureau : la composition (une ligne par catégorie : nom, barre de part du segment, pourcentage, moyenne par mois, flèche vers les transactions de la catégorie dans le segment) ; la part par mois (un SVG pur de 320 × 110 comme la maquette, ou `SparklineChart` élargi avec `baseline="zero"` et `reference` = l'habitude, axes 30-50 %), avec la phrase « 31 % en septembre, contre 38 % d'habitude ». Une colonne sous `md`. Identifiants : `structure-panel-*`, `structure-panel-row-*`, `structure-panel-share-*`.
- **`EventsPanel.vue`** : s'ouvre sous la ligne « N événements ». Un tableau : étiquette avec la pastille de sa famille (`color`), famille, montant sur la période, « Analyse → /tags/:id », flèche vers ses transactions (`eventLink`) ; en pied, « Par catégorie : Logement 427 €, Transport 391 €… » (`exceptionalByCategory`) et le lien « Tout l'exceptionnel de l'année → /tags ». Le lien « Toutes les transactions exceptionnelles → » (`exceptional: 'only'`) en en-tête. Identifiants : `events-panel`, `events-panel-row-*`, `events-panel-by-category`.
- Les panneaux restent repliés au chargement ; l'état n'est pas mémorisé.
- Tests : `dashboard.service.spec.ts` (la composition d'un segment somme au segment ; la part par mois ; `exceptionalByCategory` somme aux événements ; absents sans `includeCategoryBreakdown`) ; `StructurePanel.spec.ts`, `EventsPanel.spec.ts` ; `StructureLines.spec.ts` et `PeriodSummaryLines.spec.ts` (ouverture, un seul panneau, `aria-expanded`).
- Vérification : tests, type-check, lint, la ligne Plaisir et la ligne Événements dépliées en local dans les deux lectures.

### Lot 6 : couleurs et nettoyage

`DashboardPage.vue`, `MonthBand.vue`, `SpendingTrendTile.vue`, `lib/trends.ts`, `views/DesignReferencePage.vue`, `agent-os/product/design-system.md`, et les specs.

- Les chiffres en encre de texte partout sur la page ; les bordures gauches colorées des anciens KPI n'existent plus ; les badges d'état gardent trois teintes (teal pour sous l'habitude ou une baisse, ambre pour au-dessus ou une hausse, gris pour neutre), `BADGE_CLASSES` et `SPARK_COLORS` de `lib/trends.ts` alignés dessus (plus de vert ni de rouge sur une donnée).
- L'ambre n'apparaît que sur « À faire » et les badges de hausse ; les hachures des événements reprennent la teinte des barres.
- Code mort : `SpendingStructureCard.vue` et sa spec, les KPI, les sparklines de période dans `useDashboardData`, `assignCategoryColors` s'il ne reste que sur les revenus, `MonthlyBarChart` si plus monté nulle part hors lignes dépliées et Budget (il l'est : il reste).
- `DesignReferencePage.vue` montre `MonthBand`, `TodoCard`, `StructureLines`, `PeriodSummaryLines` ; `design-system.md` note la règle des teintes d'état.
- Tests : les specs touchées ; une passe `grep` sur `text-red-`, `text-green-`, `border-l-4` dans `components/dashboard` et `DashboardPage.vue`.
- Vérification : tests, type-check, lint, la page en mode clair et sombre.

### Lot 7 : le téléphone

`MonthBand.vue`, `SpendingTrendsCard.vue` (compact), `TodoCard.vue`, `IncomeExpensesChart.vue`, `CategoryBreakdownList.vue`, et leurs specs. Après les lots 1 à 5, une passe dédiée, conforme à l'artboard « A · sur téléphone ».

- Bande du mois en `grid-cols-2`, chiffres en 22 px, sous-textes en 11 px.
- « Ce qui change » compact : deux tuiles en ligne (nom, chiffre contre habitude, badge), « N autre tendance → ».
- « À faire » : chaque ligne est un lien tapable sur toute sa largeur (44 px).
- « Où part l'argent » : sélecteur de période sur quatre colonnes pleine largeur ; les deux lignes de structure avec libellés courts ; le graphique replié derrière « Revenus et dépenses par mois ▾ » (un `details` natif, ouvert par défaut sur bureau) ; la liste en deux lignes par poste (nom et montant, puis barre et pourcentage), sans colonne Tendance.
- Hauteur visée : moins de 4 500 px sur 390 px de large avec les douze catégories (8 500 aujourd'hui).
- Tests : les specs des composants sur la variante `sm` quand un rendu diffère ; capture Playwright headless à 390 px pour mesurer la hauteur (le Chrome MCP ne charge pas localhost).

## Hors périmètre

- **Le solde des comptes.** Les liens bancaires portent `balanceAmount` à chaque synchronisation. Un solde cumulé en tête de la bande du mois est ce que Bankin, Copilot ou Monarch montrent en premier ; c'est un cadrage à part (comptes à inclure, fraîcheur, comptes CSV sans solde). La bande du mois lui réserve la place : une cinquième tuile ou le chiffre au-dessus des quatre.
- **Un outil MCP `get_month_reading`** qui expose `DashboardMonthDto`, pour que la conversation lise la même bande que l'écran.
- **Le revenu attendu par récurrence** : la détection de récurrences ne lit que les dépenses ; un salaire récurrent donnerait une date et un montant plus sûrs que la médiane. À voir après usage.
- **La vue « tout l'exceptionnel de l'année par étiquette et par catégorie »** sur la page Étiquettes, au-delà de la carte Épisodes déplacée : un cadrage de la page Étiquettes.
- **La barre d'onglets mobile** ne change pas ; « Tendances » passe par « Plus ».
- **Les seuils** (5 % pour la sparkline, ±5 % pour un écart neutre, 80 % du revenu attendu pour « attendus ») vivent dans un seul objet de constantes, `DASHBOARD_THRESHOLDS`, réglables après usage.

## Points à trancher

1. **Le prorata de l'habitude** : linéaire sur les jours (proposé), ou pondéré par le profil habituel du mois (les loyers tombent le 1er, les courses s'étalent). Linéaire en v1 ; le badge dit « à ce stade du mois ».
2. **L'habitude en lecture « Tout »** : la médiane des dépenses nettes totales, événements compris (proposé, cohérent avec la lecture), ou toujours la vie courante avec les événements à part.
3. **« À venir » et les récurrences en retard** : une récurrence `ACTIVE` dont `nextExpected` est déjà passé sans transaction ce mois-ci compte-t-elle dans « à venir » ? Proposé : oui, jusqu'à la fin du mois, avec « attendu le N » en gris.
4. **Le mois lu par « Ce qui change » quand la période du tableau de bord s'arrête dans le passé** : question ouverte du cadrage des tendances, toujours ouverte ; la carte compacte lit le dernier mois clos du registre.

## Remarques du 2026-10-25 après livraison

Deux remarques de Richard sur la page livrée (24b1523), appliquées sur `main` :

- **« À faire » en dernière section**, après « Où part l'argent », comme sur la page Budget : la page se lit d'abord, les corvées viennent après. La « maquette A » et le lot 3 la plaçaient entre « Ce qui change » et « Où part l'argent ».
- **Les montants des quatre tuiles de « Ce mois-ci » prennent la teinte de leur nature** : bleu pour une dépense (Dépenses / Vie courante, À venir), vert pour les Revenus, violet pour le Reste à vivre (une épargne : revenus − dépenses). Un reste dépassé garde l'ambre. La règle « les chiffres en encre de texte » des « Décisions prises » ne vaut plus pour les tuiles des bandes ; elle tient partout ailleurs (design-system § 5.5, exception du 2026-10-25, `NATURE_FIGURE_CLASSES`). Même traitement sur les trois bandes du budget.
