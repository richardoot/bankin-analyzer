# Refonte de la page Budget : la même lecture que le tableau de bord

Rédigé le 2026-10-24. Fait suite au rapport [Page Budget : la même lecture que le tableau de bord](../local/budget-lecture-2026-10-24.md) (questions, inventaire, diagnostic, modifications composant par composant) et au plan [Refonte du tableau de bord](dashboard-refonte.md) dont il reprend les briques livrées (merge 24b1523) : `ReadingMenu`, `MonthBand`, `TodoCard`, les lignes repliées, `stateTints.ts`, `DASHBOARD_THRESHOLDS`. Il s'appuie aussi sur le cadrage [lignes de catégories](category-rows.md), qui a posé la règle « une figure, un graphique, un état » pour la ligne du budget. Maquettes validées le 2026-10-24 : https://claude.ai/artifact/SV4RH3eRSrwGDaBvAULXEk (quatre artboards en bas du canevas : Budget · suivi par défaut, Budget · mode « Modifier les budgets », Budget · plan terminé (bilan), Budget · suivi sur téléphone). Les chiffres des maquettes sont un plan fictif « Automne 2026 » posé sur les données réelles ; aucune maquette n'a été prise sur un vrai plan.

## Le problème

La page Budget répond à cinq questions en même temps, sur un seul écran : tenir le mois, les enveloppes qui lâchent, ce qu'il faut faire, le réalisme du plan, le bilan du plan clos. Le rapport en donne les causes :

- **Quatre horloges** : la fenêtre du plan, la fenêtre de comparaison, le mois lu (ou la moyenne des mois complets), le jour courant du prorata. Le sélecteur de mois s'appelle « Période », le mot que le tableau de bord vient de réserver à la fenêtre d'analyse.
- **Les redites** : le budget total écrit cinq fois (en-tête, synthèse, graphique, matrice, barre d'édition), l'épargne six fois, le réel à date quatre fois.
- **Huit systèmes de couleur** : `primary` sur les montants du plan, rouge sur le réel, indigo sur l'historique, vert et rouge sur les écarts et les tuiles dépliées, ambre sur les projets, teal sur les lissés, rouge sur la matrice et le graphique déplié, deux teintes de barres. Le tableau de bord n'en a plus que trois.
- **La planification est permanente** : « Comparer avec », la colonne Historique, « Couvert », « Marge vs historique » et la carte « Planification » sont sur l'écran de suivi alors qu'ils ne servent qu'à fixer les enveloppes.
- **La matrice et les lignes disent la même chose** : chaque ligne porte déjà ses mois en colonnes contre l'enveloppe ; la matrice est une lecture occasionnelle, « tout d'un coup ».
- **Des phrases en ✓ et ⚠**, des en-têtes en forme de question (« Suis-je dans les clous ? »), que le tableau de bord a abandonnés.

## Décisions prises

- **La même composition que le tableau de bord**, un bloc par question dans l'ordre des visites : l'en-tête (plan, statut, dates, Historique, Nouveau budget, menu « Lecture »), la bande **« Ce mois-ci »** (Dépensé, Reste à dépenser, Épargne, Enveloppes), **« À faire »**, **« Les enveloppes »** (toutes les catégories du plan, puis quatre lignes repliées : Projets, Achats lissés, Dépenses et enveloppe par mois, Mois par mois).
- **Le mois lu par défaut est le mois en cours** tant que le plan court ; « Moyenne du plan » est une option du sélecteur, plus le défaut. Le sélecteur s'appelle **« Mois lu »** et vit dans l'en-tête de la bande, plus dans l'en-tête du tableau. Il gouverne la bande et les figures des lignes, comme aujourd'hui.
- **Deux horloges au lieu de quatre** en suivi : le mois lu et le jour courant. La fenêtre de comparaison n'existe qu'en édition ; la fenêtre du plan est la liste des mois du sélecteur.
- **Une seule lecture pour les deux pages** : la bascule Vie courante / Tout et l'interrupteur des remboursements reçus deviennent une préférence du store des filtres, sous une seule clé locale, lue par le tableau de bord, les tendances et le budget. Ce qu'on lit en vie courante sur le tableau de bord, on le suit en vie courante au budget. Les remboursements en attente restent la préférence serveur qu'ils sont.
- **Le mode « Modifier les budgets » change la question de la page**, pas seulement les champs : la bande du mois devient la bande **« Planification »** (Revenus de référence, Budget total du brouillon, Épargne prévue contre décidée, Marge par rapport à l'historique), « Comparer avec » apparaît en tête des enveloppes, la colonne Historique avec « Reprendre » et le badge « Couvert » reviennent sur chaque ligne, les actions rapides et la barre collante aussi. La barre et la bande disent le même total.
- **Le plan terminé lit le bilan** : la bande devient **« Bilan du plan »** (Dépensé sur le plan contre l'enveloppe, Épargne réalisée contre décidée, Enveloppes tenues sur N, Projets contre la réserve), « Mois lu » propose le plan entier ou un de ses mois, « À faire » propose le plan suivant.
- **Le détail se replie en place** : Projets et Achats lissés quittent leurs encadrés de couleur et deviennent deux lignes repliées sous la liste ; le graphique mensuel et la matrice deviennent deux `details` sous ces lignes (le graphique ouvert sur bureau, la matrice repliée, les deux repliés sur téléphone). La matrice reste : c'est le bon format pour « tout d'un coup ».
- **La charte du tableau de bord** : les chiffres en encre, une teinte de donnée (`DATA_HUE`), trois tons d'état (`stateTints.ts`), l'ambre réservé à « À faire » et aux dépassements, plus de ✓ ni de ⚠, plus de rouge, de vert, d'indigo ni de `primary` sur un chiffre. Le rouge reste aux erreurs.
- **« Couvert » n'existe qu'en édition** : c'est une information de planification (l'enveloppe couvre l'historique), pas de suivi.
- **Aucun backend** : `useBudgetComparison` porte déjà les mois du plan, le prorata du mois en cours et les moyennes ; `BudgetPlanDto` porte `savingsTarget`, `referenceIncome`, `projectReserve` ; `TagBudgetSummaryDto` porte la réserve engagée.
- **Identifiants de test** : ceux des composants conservés suivent leurs composants (`budget-row-*`, `budget-input-*`, `budget-prorata-*`, `matrix-*`, `project-*`, `budget-amortized-*`, `budget-edit-*`, `budget-save-*`, `comparison-*`, `history-*`). Ceux des blocs retirés (`budget-filters-card`, `savings-summary`, `summary-*`, `budget-breakdown-mode`, `budget-everyday-amortized-note`, `budget-event-*`, `budget-projects`, `budget-amortized`, `budget-month-selector`, `budget-actual-period`) sont remplacés par ceux des nouvelles bandes, nommés dans les lots.

## Les lots

Chaque lot est livrable seul et laisse la page cohérente. L'ordre est celui des dépendances. Les tests sont à écrire avant de passer au lot suivant (CLAUDE.md). Vérification commune à chaque lot : `pnpm --filter frontend test`, type-check (`vue-tsc --build`, voir la note mémoire), lint, la page en local avec un plan en cours dans les deux lectures.

### Lot 0 : la lecture partagée, la carte de filtres retirée

`frontend/src/stores/filters.ts`, `composables/useDashboardData.ts`, `views/DashboardPage.vue`, `views/TrendsPage.vue`, `views/BudgetPage.vue`, `components/budget/BudgetTableControls.vue`, `components/budget/ComparisonSelector.vue`, et leurs specs.

- **La préférence de lecture dans le store** : `breakdownMode` (`'everyday' | 'real'`, défaut `everyday`) et `deductReimbursements` (défaut `true`) passent dans `stores/filters.ts`, persistés en localStorage sous une clé `reading` (un objet `{ breakdownMode, deductReimbursements }`). Au premier chargement sans cette clé, le store lit `dashboard-breakdown-mode` s'il existe, puis l'efface ; `budget-breakdown-mode` est ignoré et effacé. `deductPendingReimbursements` ne change pas (préférence serveur). `useDashboardData` et `BudgetPage` lisent et écrivent le store ; `BREAKDOWN_MODE_KEY` et `setBreakdownMode` disparaissent des deux. Le type `BreakdownMode` reste exporté d'un seul endroit (`useBudgetComparison` l'exporte déjà ; `useDashboardData` l'importe ou le réexporte, pas deux définitions).
- **`ReadingMenu` sur la page Budget**, à droite de `BudgetPlanHeader` (une prop `actions` ou un slot dans l'en-tête, comme sur le tableau de bord), avec `hasExceptionalExpenses` = `hasExceptionalInPlan`, `hasAmortizedExpenses` = `hasAmortizedInPlan`, `pendingSyncError` = l'erreur de rafraîchissement des statistiques (`budget-statistics-error`). Le composant ne change pas ; l'identifiant `reading-menu` est le même sur les trois pages.
- **La carte de filtres disparaît** (`budget-filters-card`) : les deux `ToggleSwitch` sont dans le menu ; l'état « rafraîchissement » (`budget-statistics-refreshing`) devient une ligne discrète sous l'en-tête, comme le tableau de bord traite la synchronisation en attente.
- **La bande grise de `BudgetTableControls` disparaît** (`budget-breakdown-mode`, ses deux phrases, `budget-everyday-amortized-note`, les pastilles `budget-event-*`) : la lecture est dans le menu, les événements seront dans la ligne Projets (lot 3). En attendant le lot 3, `BudgetProjectsSection` reste où elle est.
- **« Comparer avec » devient un `SegmentedControl`** : `ComparisonSelector` est réécrit sur `components/ui/SegmentedControl.vue` (options 3 mois, 6 mois, 12 mois, Il y a un an quand `yearAgoAvailable`, Dates…), les deux champs de dates sous le segment quand `custom` est choisi, `comparison-custom-inverted` conservé. Il est monté **dans l'en-tête du tableau, en édition seulement** (`v-if="isEditing"`) ; hors édition, `comparisonPreset` est forcé à `none`, donc `showHistoricalColumn` est faux et la colonne Historique n'est plus rendue en suivi. Identifiants `comparison-selector`, `comparison-option-*` conservés ; `comparison-trigger` disparaît.
- Tests : `filters.spec.ts` (défauts, persistance, migration de l'ancienne clé, effacement de la clé budget) ; `useDashboardData.spec.ts` (lit le store) ; `DashboardPage.spec.ts` et `TrendsPage.spec.ts` (inchangés dans leur attente, le store mocké) ; `ComparisonSelector.spec.ts` réécrit (segment, dates, inversion) ; `BudgetPage.spec.ts` (le menu, l'absence de la carte de filtres et de la bande, la colonne Historique absente en suivi et présente en édition avec une comparaison).

### Lot 1 : la bande « Ce mois-ci » du budget

Nouveau `components/budget/BudgetMonthBand.vue`, nouveau `lib/budgetMonth.ts` (les calculs purs), `views/BudgetPage.vue`, `components/budget/BudgetTableControls.vue`, `components/budget/BudgetPlanHeader.vue`, retrait de `BudgetSavingsSummary.vue`, et leurs specs. Dépend du lot 0.

- **`lib/budgetMonth.ts`** : une fonction pure `budgetMonthReading({ plan, comparison, selectedMonth, breakdownMode, today })` qui rend ce que la bande affiche, à partir de ce que `useBudgetComparison` et la page calculent déjà (`seriesFor`, `aggregatesFor`, `incomeAggregates`, `selectedMonthProgress`, `startedPlanMonths`, `completePlanMonthsCount`, `savedPlanTotal`) :
  - `spent` : le réel à date du mois lu dans la lecture (ou la moyenne des mois complets quand « Moyenne du plan » est lu) ; `envelope` = `savedPlanTotal` ; `envelopeToDate` = l'enveloppe au prorata `elapsedDays / totalDays` quand le mois lu est le mois en cours, l'enveloppe entière sinon ; `spentSeries` : le réel de chaque mois commencé du plan, dans l'ordre ;
  - `remaining` = `envelope − spent`, `daysLeft` = `totalDays − elapsedDays` sur le mois en cours, `null` sinon ;
  - `savingsPlanned` = `referenceIncome − envelope` (`null` sans `referenceIncome`), `savingsDecided` = `savingsTarget`, `savingsActual` = `planActualIncomeAvg − planActualExpenseAvg` sur les mois complets, `savingsActualMonths` = `completePlanMonthsCount` ;
  - `envelopesOver` : les catégories dont le réel du mois lu dépasse l'enveloppe (la règle de `rowStatus`), `envelopesCount` : les catégories du plan avec une enveloppe ;
  - les tons d'état par la règle de `gapOf(value, reference)` de `MonthBand.vue` (le ratio, `DASHBOARD_THRESHOLDS.neutralGap`, le ton) : l'extraire dans `lib/stateTints.ts` pour la partager.
- **`BudgetMonthBand.vue`** : une `BaseCard` sur le modèle de `MonthBand`, titre « Ce mois-ci · octobre, au 23 » (ou « Septembre » pour un mois clos, « Moyenne du plan · N mois clos » pour la moyenne), sous-titre « L'enveloppe est ramenée au jour du mois », et à droite le **sélecteur « Mois lu »** : le `SegmentedControl` des mois commencés du plan (libellés courts, le mois en cours marqué) plus « Moyenne du plan », déplacé de `BudgetTableControls` (`budget-month-selector` conservé). Quatre tuiles (`md:grid-cols-4`, `grid-cols-2` sous `md`) :
  - **Dépensé** : `spent` en grand ; badge de l'écart à `envelopeToDate` (teal sous, ambre au-dessus, gris à ±5 %), note « à ce stade du mois » sur le mois en cours ; « X € d'enveloppe au 23 · Y € pour le mois » ; `SparklineChart` (celui de `components/budget/`) de `spentSeries`, `reference` = `envelope`, `baseline="zero"`, le dernier point dans le ton d'état ;
  - **Reste à dépenser** : `remaining` ; badge « pour N jours » sur le mois en cours, « sur le mois » sinon ; fond teal pâle comme « Reste à vivre » ; en négatif, chiffre en ambre et badge « dépassé de X € », jamais de rouge ;
  - **Épargne** : `savingsPlanned` « par mois prévus » ; badge de l'écart à `savingsDecided` quand il existe (« +115 € vs 500 € décidés »), « pas d'objectif » en gris sinon ; « X €/mois réalisés sur N mois clos » quand `savingsActualMonths ≥ 1`, « pas encore de mois clos » sinon ; sans `referenceIncome`, la tuile dit « Revenus de référence non renseignés » et un lien vers l'édition ;
  - **Enveloppes** : « 1 sur 12 » dépassée(s) sur le mois lu ; badge ambre avec le nom de la première (puis « et N autres ») ou gris « toutes tenues » ; la tuile est un lien qui fait défiler vers la première ligne dépassée.
  - Chiffres en encre, `tabular-nums`. Identifiants : `budget-month-band`, `budget-month-title`, `budget-month-read` (le segment), `budget-tile-spent`, `budget-tile-remaining`, `budget-tile-savings`, `budget-tile-envelopes`, `budget-badge-*`.
- **Ce qui disparaît** : `BudgetSavingsSummary.vue` et sa spec (`savings-summary`, `summary-followup`, `summary-planning`, `summary-plan-only`, `summary-budget*`), ses props calculées dans la page (`summaryComparisonProps`, `planToDateIncomeAvg` si plus lue) ; la ligne « Épargne décidée · Budget projets » de `BudgetPlanHeader` (`plan-project-reserve` part dans la ligne Projets au lot 3 ; d'ici là, la réserve reste lisible dans `BudgetProjectsSection`) ; dans `BudgetTableControls`, le sélecteur de mois et `budget-actual-period` (le mois lu est dit par le titre de la bande).
- Le plan « futur » (pas encore commencé) : la bande affiche l'enveloppe, l'épargne prévue et « Le plan commence le 1er novembre », sans Dépensé ni Reste.
- Tests : `budgetMonth.spec.ts` (le prorata sur le mois en cours, l'enveloppe entière sur un mois clos, la moyenne, les deux lectures, l'épargne sans `referenceIncome`, les enveloppes dépassées) ; `BudgetMonthBand.spec.ts` (les quatre tuiles, les badges, le sélecteur, le plan futur) ; `BudgetPage.spec.ts` (la bande en tête, `BudgetSavingsSummary` absent, le mois lu par défaut est le mois en cours, « Moyenne du plan » disponible).

### Lot 2 : « À faire »

Nouveau `lib/budgetTodo.ts`, `views/BudgetPage.vue`, et leurs specs. Dépend du lot 1 (les enveloppes dépassées du mois lu). Aucun nouveau composant : `TodoCard` est monté tel quel.

- **`lib/budgetTodo.ts`** : une fonction pure `budgetTodoItems({ plan, status, reading, projects, categoriesWithoutEnvelope })` qui rend une liste ordonnée de `TodoItem` (le type de `lib/todo.ts`) :
  1. chaque enveloppe dépassée sur le mois lu : « Restaurants et bars : enveloppe dépassée de 12 € » → ancre vers la ligne (`{ hash: '#budget-row-<id>' }`, la ligne reçoit cet `id`) ;
  2. la réserve projets entamée (`projectReserve − projects.totalBudget < 0`) : « Réserve projets : 1 053 € engagés sur 690 € » → la ligne Projets ;
  3. les catégories qui dépensent sans enveloppe sur le plan (réel moyen > 0, enveloppe 0) : « Impôts et taxes sans enveloppe · 59 € par mois » → entrer en édition ;
  4. un plan `current` dont le dernier mois est le mois en cours : « Le plan se termine le 31 décembre : préparer le suivant » → Nouveau budget ; un plan `past` sans plan courant : « Aucun plan en cours : créer le suivant » ;
  5. `projectReserve < 0` : « Le plan ne tient pas dans les revenus de référence (−X €) » → entrer en édition.
     Quatre lignes puis « et N autres » (`TODO_SHOWN`) ; rien quand il n'y a rien.
- **Dans la page** : `<TodoCard :items="budgetTodoItems" />` entre la bande et le tableau ; `todo-card` et `todo-item-*` sont les identifiants du composant. Les actions « entrer en édition » et « Nouveau budget » sont des routes avec query (`?edit=1`, `?new=1`) que la page lit au montage, pour que `TodoItem.to` reste un `RouteLocationRaw`.
- Tests : `budgetTodo.spec.ts` (chaque source, l'ordre, la liste vide, le plan qui se termine) ; `BudgetPage.spec.ts` (la carte entre la bande et le tableau, absente quand rien, les deux query).

### Lot 3 : les enveloppes

`components/budget/BudgetCategoryRow.vue`, `components/budget/MonthsVsBudgetChart.vue`, `components/budget/BudgetTableControls.vue`, nouveaux `components/budget/BudgetProjectsLine.vue` et `components/budget/BudgetAmortizedLine.vue` (qui absorbent `BudgetProjectsSection` et `BudgetAmortizedSection`), `views/BudgetPage.vue`, et leurs specs. Dépend du lot 1.

- **`BudgetTableControls` se réduit à l'en-tête de la liste** : titre « Les enveloppes » avec le sous-titre « Toutes les catégories du plan, les plus lourdes en tête », le `select` de tri (`sortOptions.ts`, inchangé), le bouton « Modifier les budgets » (`budget-edit-button`). L'avertissement `budget-past-plan-warning` et les actions rapides `budget-quick-actions` restent et ne se montrent qu'en édition (lot 4 les reprend).
- **`BudgetCategoryRow`** garde sa grille et change de charte :
  - badge « Dépassé » en `STATE_BADGE_CLASSES.over` sans ⚠ ; « Couvert » (`rowStatus === 'covered'`) rendu seulement quand `editing` ;
  - la figure « 162 € sur 150 € » en encre (`text-gray-900`), le prorata `budget-prorata-*` en gris ; la colonne Historique seulement quand `showHistorical` (déjà faux hors édition depuis le lot 0) ;
  - les deux tuiles dépliées « Marge vs historique » et « Reste à dépenser » (vert / rouge) deviennent une ligne de faits en encre (`budget-row-facts-*` existe) : « Reste 38 € sur l'enveloppe · 3 mois sur 4 sous l'enveloppe » avec un badge d'état ; « Marge vs historique » seulement en édition ;
  - le `MonthlyBarChart` déplié passe de `#ef4444` à `DATA_HUE`, `reference` = l'enveloppe, `overlay` = les événements du mois en lecture Tout (la page a `planActualExceptionalAverage` ; par mois, `seriesFor` avec le filtre exceptionnel), comme la ligne dépliée du tableau de bord ;
  - la ligne reçoit `:id="\`budget-row-${category.categoryId}\`"` pour les ancres de « À faire ».
- **`MonthsVsBudgetChart`** : les colonnes en `DATA_HUE`, le mois au-dessus de l'enveloppe en `STATE_COLORS.over`, le mois en cours en `blue-300` plus clair, l'enveloppe en pointillé d'encre (`stroke-gray-700 dark:stroke-slate-300`), la bande du mois sélectionné en gris. `months-chart-*` conservés.
- **`BudgetProjectsLine.vue`** remplace l'encadré ambre : une ligne de 13 px sous la liste, « Projets de la période · 1 053 € engagés sur 690 € de réserve » avec un badge d'état (ambre quand `reserveRemaining < 0`, gris sinon, « pas de réserve » sans `projectReserve`), bouton « Déplier » `aria-expanded` ; dépliée, le contenu actuel de `BudgetProjectsSection` (familles avec barre de part en `DATA_HUE`, étiquettes, liens `project-*`), sans fond ambre. Les événements de la période (`planEvents`, les anciennes pastilles) y sont listés sous les familles, chacun avec sa pastille de couleur. `plan-project-reserve` et `reserve-remaining` conservés dans la ligne.
- **`BudgetAmortizedLine.vue`** remplace l'encadré teal : « Achats lissés en cours · 21 € par mois · 3 achats ▾ », dépliée, la liste actuelle (`budget-amortized-*`, `budget-amortized-total`), sans fond teal.
- Les deux lignes restent repliées au chargement ; un seul panneau ouvert à la fois n'est pas requis (ce sont deux sujets).
- Tests : `BudgetCategoryRow.spec.ts` (Couvert absent hors édition, présent en édition ; Dépassé en ambre ; la ligne de faits ; l'`id`) ; `MonthsVsBudgetChart.spec.ts` (les classes des colonnes) ; `BudgetProjectsLine.spec.ts`, `BudgetAmortizedLine.spec.ts` (repliée, dépliée, `aria-expanded`, les événements) ; `BudgetPage.spec.ts` (l'ordre : liste, Projets, Achats lissés ; les encadrés absents).

### Lot 4 : le mode édition, la planification

Nouveau `components/budget/BudgetPlanningBand.vue`, `views/BudgetPage.vue`, `components/budget/BudgetEditBar.vue`, `components/budget/BudgetTableControls.vue`, `components/budget/BudgetCategoryRow.vue`, et leurs specs. Dépend des lots 0, 1 et 3.

- **`BudgetPlanningBand.vue`** remplace `BudgetMonthBand` quand `isEditing` (la page bascule entre les deux ; `BudgetMonthBand` n'a pas de mode édition). Titre « Planification · Automne 2026 », sous-titre « Ce que le plan prévoit par mois, à jour de la saisie ». Quatre tuiles :
  - **Revenus de référence** : `referenceIncome` ; « saisi à la création » ; sans valeur, « non renseignés » et le lien vers le champ (l'assistant de création le porte ; en édition, un champ dans la tuile) ;
  - **Budget total** : `draftPlanTotal` en grand, à jour à chaque frappe ; badge de `draftDelta` (« −30 € vs enregistré », teal en baisse, ambre en hausse, gris à 0) ; « 1 850 € enregistrés · 2 enveloppes modifiées » (`dirtyCategoryIds.length`) ;
  - **Épargne prévue** : `referenceIncome − draftPlanTotal` ; badge de l'écart à `savingsTarget` ; « réserve projets 145 € × 6 mois = 870 € » (la différence multipliée par `monthCount`, la même règle que `projectReserve` côté backend) ; en négatif, ambre « le plan dépasse les revenus » ;
  - **Marge vs historique** : `comparisonExpenseAvg − draftPlanTotal` quand une comparaison est choisie ; badge d'état ; « historique 1 853 € · janv. → juin » (le libellé de la comparaison) ; sans comparaison, « Choisir une comparaison » qui ouvre le segment.
  - Identifiants : `budget-planning-band`, `budget-tile-reference-income`, `budget-tile-total`, `budget-tile-savings-planned`, `budget-tile-margin`.
- **L'en-tête du tableau en édition** : « Comparer avec » (lot 0) sur la ligne du titre, les actions rapides (`budget-quick-actions`, `budget-apply-averages`, `budget-clear-envelopes`) sous lui, l'avertissement `budget-past-plan-warning` au-dessus ; le tri reste.
- **Les lignes en édition** : la colonne Historique avec « Reprendre » (`budget-take-historical-*`), le réel à date avec « Reprendre » (`budget-take-actual-*`), le champ `budget-input-*` et la valeur barrée `budget-was-*`, le badge « Couvert » ; `rowGridTemplate` ne change pas de logique.
- **`BudgetEditBar`** : le même `draftPlanTotal`, `savedPlanTotal`, `draftDelta` que la bande (l'audit avait relevé deux totaux différents : un seul calcul, `sumOf(budgetInputs)` sur toutes les entrées) ; les deltas passent de rouge / `primary` à `STATE_BADGE_CLASSES` ; « 2 enveloppes modifiées · Total 1 850 € → 1 820 € · −30 € par mois · Annuler / Enregistrer ».
- Entrer en édition fait défiler vers la bande (la page change de question) ; la barre d'onglets mobile reste masquée (`useSuppressTabBar`) ; Historique et Nouveau budget sont désactivés pendant l'édition, comme aujourd'hui.
- Tests : `BudgetPlanningBand.spec.ts` (les quatre tuiles, le total qui suit le brouillon, les badges, sans `referenceIncome`, sans comparaison) ; `BudgetEditBar.spec.ts` (nouveau : les tons, le total) ; `BudgetPage.spec.ts` (la bande de planification à la place de la bande du mois en édition, retour au suivi après Annuler et après Enregistrer, le même total dans la bande et la barre).

### Lot 5 : le graphique et la matrice repliés

`components/budget/MonthlyExpensesChart.vue`, `components/budget/BudgetMonthlyMatrix.vue`, `views/BudgetPage.vue`, et leurs specs. Dépend du lot 3.

- **Deux `details` sous les lignes Projets et Achats lissés**, sur le motif de « Revenus et dépenses par mois » du tableau de bord (`DashboardPage.vue`, le `details` avec `useMediaQuery`) : « Dépenses et enveloppe par mois » (ouvert sur bureau, replié sous `md`) et « Mois par mois » (replié partout). Identifiants `budget-chart-details`, `budget-matrix-details` ; `budget-monthly-matrix` conservé.
- **`MonthlyExpensesChart`** prend la charte d'`IncomeExpensesChart` : les mois du plan en colonnes `DATA_HUE`, les mois de comparaison en gris clair et **seulement en édition** (hors édition, la série se limite aux mois du plan), le mois en cours plus clair, l'enveloppe totale (`totalBudget`) en pointillé d'encre, les revenus (`chartAverageIncome`) en ligne d'encre ; la légende se limite à ce qui est dessiné (`legend-*` conservés, `legend-comparison-swatch` seulement en édition). Les couleurs vert / rouge des infobulles disparaissent ; l'écart à l'enveloppe est dit en texte.
- **`BudgetMonthlyMatrix`** : les cellules dépassées en `STATE_BADGE_CLASSES.over` (plus de rouge), la colonne Budget et le total en encre (plus de `text-primary`), `matrix-*` conservés.
- Tests : `MonthlyExpensesChart.spec.ts` (sans comparaison hors édition, avec en édition, les deux lignes de référence) ; `BudgetMonthlyMatrix.spec.ts` (les classes) ; `BudgetPage.spec.ts` (les deux `details`, leur état par défaut).

### Lot 6 : le plan terminé

Nouveau `components/budget/BudgetReviewBand.vue`, `lib/budgetMonth.ts`, `lib/budgetTodo.ts`, `views/BudgetPage.vue`, et leurs specs. Dépend des lots 1 et 2.

- **`BudgetReviewBand.vue`** remplace `BudgetMonthBand` quand `planStatus(plan) === 'past'`. Titre « Bilan du plan · Printemps 2026 », sous-titre « janvier → juin 2026 · 6 mois », le sélecteur « Mois lu » avec « Le plan » (défaut) puis chaque mois. Quatre tuiles :
  - **Dépensé** : `planActualExpenseAvg` « par mois » ; badge de l'écart à l'enveloppe ; « 11 378 € sur 11 100 € d'enveloppe sur le plan » ; sparkline des six mois, référence = l'enveloppe ;
  - **Épargne réalisée** : `planActualIncomeAvg − planActualExpenseAvg` ; badge de l'écart à `savingsTarget` ; « 3 624 € sur le plan » ;
  - **Enveloppes tenues** : « 9 sur 12 » en moyenne sur le plan ; badge gris ou ambre avec les noms des dépassées ;
  - **Projets** : `projects.totalBudget` « sur 900 € de réserve » ; badge d'état sur la réserve.
  - Un mois choisi dans « Mois lu » : la bande lit ce mois (les mêmes tuiles, `budgetMonthReading` du lot 1 avec un mois clos). Identifiants : `budget-review-band`, les mêmes `budget-tile-*`.
- **« À faire » d'un plan terminé** : « Aucun plan en cours : créer le suivant » quand il n'y a pas de plan courant, et « Trois enveloppes dépassées en moyenne : Alimentation, Loisirs, Shopping » qui fait défiler vers la liste (lot 2 le prévoit, ce lot le branche sur `isPlanFinished`).
- Les lignes gardent leur figure (réel moyen sur enveloppe) et leurs six mini-colonnes ; la ligne dépliée dit « N mois sur 6 au-dessus ».
- L'état vide est inchangé.
- Tests : `BudgetReviewBand.spec.ts` (les quatre tuiles, « Le plan » par défaut, un mois choisi) ; `budgetTodo.spec.ts` (le plan terminé) ; `BudgetPage.spec.ts` (la bande du bilan sur un plan `past`, celle du mois sur un plan `current`).

### Lot 7 : couleurs, téléphone, code mort

`views/BudgetPage.vue`, `components/budget/*`, `views/DesignReferencePage.vue`, `agent-os/product/design-system.md`, et les specs. Après les lots 1 à 6.

- **Couleurs** : une passe `grep` sur `text-red-`, `text-green-`, `bg-red-`, `bg-green-`, `emerald`, `indigo`, `#ef4444`, `#6366f1`, `#818cf8`, `text-primary` sur un chiffre dans `components/budget` et `BudgetPage.vue` ; il ne reste que le rouge de la bannière d'erreur et des actions destructrices (`delete-row-*`). `SparklineChart` de `components/budget/` prend `DATA_HUE` par défaut au lieu de l'indigo, ou disparaît au profit de celui du tableau de bord s'ils sont identiques (à vérifier : même API `data`, `reference`, `baseline`, `endColor`, `label`).
- **Vocabulaire** : plus de « Période » pour le mois lu, plus de ✓ ni de ⚠, plus d'en-tête en forme de question ; « Réel à date » et « Enveloppe » restent.
- **Téléphone** (artboard « Budget · suivi sur téléphone ») : Historique et Nouveau budget derrière un bouton « … » (`aria-haspopup="menu"`, une feuille `BaseModal` sous `sm`) à côté du bouton « Lecture » réduit à son icône ; la bande en `grid-cols-2`, chiffres en 22 px ; « Mois lu » en lien « Mois lu : oct. ▾ » qui ouvre une feuille ; « À faire » en lignes tapables de 44 px ; chaque enveloppe en deux lignes (nom et badge, « 162 € / 150 € ») plus une barre de consommation (`DATA_HUE`, ambre au-dessus), sans mini-colonnes ; les quatre lignes repliées ; en édition, le champ sous le nom sur toute la largeur. Hauteur visée : moins de 3 500 px sur 390 px avec douze enveloppes. Capture Playwright headless à 390 px (le Chrome MCP ne charge pas localhost).
- **Code mort** : `BudgetSavingsSummary.vue`, `BudgetProjectsSection.vue`, `BudgetAmortizedSection.vue` et leurs specs ; `summaryComparisonProps`, `planToDateIncomeAvg`, `monthOptions` si le segment les porte autrement, les calculs de `BudgetPage.vue` que plus rien ne lit (la page passe sous 1 200 lignes ; si les bandes en sortent, un composable `useBudgetPage` n'est pas requis par ce lot).
- `DesignReferencePage.vue` montre `BudgetMonthBand`, `BudgetPlanningBand`, les deux lignes repliées ; `design-system.md` § 5.5 dit que les teintes d'état valent pour le Budget et que `primary` ne colore plus un chiffre du plan (la ligne « Sur Budget, les chiffres du plan » du tableau des couleurs disparaît).
- Tests : les specs touchées ; la variante `sm` dans `BudgetMonthBand.spec.ts` et `BudgetCategoryRow.spec.ts` quand le rendu diffère ; `BudgetPage.spec.ts` sur le menu « … ».

## Hors périmètre

- **Le backend** : rien n'est demandé ; si un calcul du lot 1 ou du lot 6 se révèle trop lourd côté client (le réel par mois et par catégorie est déjà dans `BudgetStatisticsDto`), un `GET /budgets/:id/reading` est le cadrage suivant, pas celui-ci.
- **Un outil MCP `get_budget_reading`** qui expose la bande du mois, pour que la conversation lise la même chose que l'écran.
- **Le prorata pondéré de l'enveloppe** : la maquette montre un Logement payé le 1er lu comme « en avance » par le prorata linéaire. C'est le point à trancher n° 1 du plan Dashboard, à résoudre une fois pour les deux pages.
- **L'assistant de création** (`wizard/`) : il garde son déroulé ; seules ses couleurs suivent le lot 7 si elles sortent de la charte.
- **Les enveloppes annuelles des familles** (`tag-families.md`) : la ligne Projets les lit, elle ne les règle pas.
- **Les seuils** : ±5 % pour un écart neutre, le demi-centime de tolérance d'un dépassement (`TOLERANCE` de `MonthsVsBudgetChart`, 0,005), à ranger dans `DASHBOARD_THRESHOLDS` (ou son renommage en `READING_THRESHOLDS` si le lot 1 le juge utile) et à régler après usage.

## Points à trancher

1. **Le défaut du mois lu** : le mois en cours (proposé, cohérent avec « Ce mois-ci ») ou la moyenne du plan (l'actuel). Un plan qui vient de commencer n'a qu'un mois de toute façon.
2. **Une seule lecture pour les deux pages** : proposé oui. L'argument contre : on peut vouloir suivre un budget « tout compris » en lisant le tableau de bord en vie courante. L'argument pour : une seule préférence, un seul menu, aucun écart inexpliqué entre les deux pages. Si non, le lot 0 garde deux clés et le menu dit laquelle il règle.
3. **La matrice** : repliée sous la liste (proposé, lot 5) ou supprimée, les lignes portant déjà leurs mois. La supprimer retire `BudgetMonthlyMatrix.vue`, `matrixMonths`, `matrixRows` et leur spec.
4. **« Couvert »** : réservé à l'édition (proposé, lot 3) ou conservé en suivi.
5. **« Reste à dépenser »** : l'enveloppe entière moins le dépensé (proposé : c'est ce qu'il reste pour finir le mois), ou l'enveloppe au prorata moins le dépensé (ce qu'on a d'avance ou de retard à ce jour, déjà dit par le badge de Dépensé).
