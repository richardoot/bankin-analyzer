# Épisodes de l'année : les années d'une famille, la part de l'exceptionnel

Rédigé le 2026-10-23. Fait suite aux [parts en barres](category-share-bars.md) (mergé le 2026-10-23, bf1c928) et au cadre des [familles d'étiquettes](tag-families.md) (lot 5, carte « Épisodes de l'année »). Maquette validée le 2026-10-23 : artboard 5 de https://claude.ai/artifact/Kd7EECcXdkHtZT9HrHb5ke.

## Le problème

La carte « Épisodes de l'année » dessine une barre par famille sur une échelle commune en euros, dont le maximum est la plus grosse famille ou la plus grosse enveloppe. La première famille est donc toujours pleine : sur le compte réel, Voyages et Hyrox sont à 527 € et 526 €, deux barres pleines pour 2,7 % du réel chacune, alors que le texte dit « 3 % du réel ». Et la barre change de sens d'une ligne à l'autre : jauge d'enveloppe quand il y en a une, rang entre familles sinon.

La part du réel est déjà écrite, et à 3 % une barre proportionnelle ne montrerait rien. La question utile d'une famille est celle du cadre des familles : est-ce que cette édition coûte comme d'habitude. Le tableau de bord ne la montre nulle part.

## Décisions prises

- **En tête de carte, une seule barre empilée** : la part de chaque famille dans les **dépenses exceptionnelles de l'année civile**, dans la couleur de la famille, le gris restant étant l'exceptionnel sans famille. Une famille ne contient que des étiquettes exceptionnelles (règle du cadre), la barre est donc une vraie composition, et le gris dit ce qui n'est pas encore rangé dans une famille. Pas le plaisir au dénominateur : la nature vient de la catégorie, pas de l'étiquette, un épisode mélange essentiel et plaisir, les parts ne s'emboîteraient pas.
- **Le poids dans l'année est dit une fois, en chiffre**, dans la phrase de tête : « 1 053 € d'épisodes cette année · 69 % de l'exceptionnel de l'année (1 530 €) · 5 % du réel ». `realExpensesOfYear` reste pour ce chiffre.
- **Par famille, ses années côte à côte** : un mini graphique en colonnes, l'année en cours dans la couleur de la famille, les précédentes en gris, l'échelle propre à la famille (son maximum ou son enveloppe). Pas de barre à échelle commune entre familles. Une famille à sa première année n'a qu'une colonne.
- **L'enveloppe annuelle est une ligne pointillée** sur ce graphique, dans la même unité que les colonnes, comme la moyenne sur la sparkline des catégories. Ce qui dépasse le trait est rouge. Plus de jauge d'enveloppe séparée. L'enveloppe est celle d'aujourd'hui (`annualBudget`, une seule valeur) : elle est tracée sur toutes les années, le texte ne juge que l'année en cours.
- **Les années dessinées** : de la première année où la famille a dépensé jusqu'à l'année en cours, sans trou (une année à 0 est une colonne vide avec son étiquette), six années au plus (les plus récentes).
- **La ligne de faits** : « 34 % de l'exceptionnel · 1 étiquette · 18 transactions · 547 € par an jusqu'ici · reste 73,63 € sur 600 € par an ». « Première année » remplace la moyenne quand il n'y a pas d'année passée ; « dépassement de X € » en rouge remplace le reste. Le pourcentage est au même dénominateur que la barre de tête : une seule échelle sur la carte.
- **Règle inchangée** : une figure (le dépensé de l'année), un graphique (les années), un état (le dépassement en rouge) par famille. La part est l'étiquette de la barre de tête, écrite dans les faits, pas une seconde barre.
- **Couleurs par famille conservées** : ce sont celles des étiquettes, choisies par l'utilisateur, stables. La pastille devant le nom reste, elle relie la ligne à sa tranche de la barre de tête.
- **Conservés** : condition d'affichage (`hasExceptionalExpenses` et au moins une famille), lien vers la page de famille, lien « voir les transactions » sur l'année, note de pied sur les dates de paiement, figure en rouge en dépassement, grille une colonne sous `md` et deux au-delà.
- **Dénominateur exceptionnel** : `exceptionalExpensesOfYear`, les dépenses datées de l'année civile (date de paiement, comme `realExpensesOfYear`) portant une étiquette exceptionnelle (la règle `exceptional_tx` de la requête 1 du tableau de bord : `tg.is_exceptional = true`), nettes selon les filtres, comptes exclus ignorés. Les familles comptent en année d'événement : la somme peut à la marge ne pas tomber juste, comme aujourd'hui avec le réel. La barre borne chaque tranche à 100 % et le reste à 0.
- **Identifiants de test conservés** : `tag-families-of-year`, `family-of-year-*`, `family-of-year-link-*`, `family-of-year-spent-*`, `family-of-year-transactions-link-*`, `family-of-year-details-*`. Supprimé : `family-of-year-bar-*`. Nouveaux : `families-of-year-header`, `families-of-year-stack`, `families-of-year-stack-slice-*`, `families-of-year-stack-rest`, `family-of-year-years-*`.

## Lots

### Lot 0 : les années et l'exceptionnel (backend)

- `backend/src/dashboard/dto/dashboard-summary-response.dto.ts` : sur `TagFamilyOfYearDto`, `spentByYear: { year: number; spent: number }[]`, une entrée par année civile d'événement où la famille a des dépenses, triées par année croissante, l'année en cours comprise (son `spent` égal à `spent`). Sur le DTO de résumé, `exceptionalExpensesOfYear: number | null`, documenté à côté de `realExpensesOfYear`, null aux mêmes conditions.
- `backend/src/dashboard/dashboard.service.ts`, `tagFamiliesOfYear` (vers la ligne 1055) : la CTE `year_tx` perd son filtre `FAMILY_EVENT_YEAR = year` et porte l'année (`FAMILY_EVENT_YEAR AS event_year`) ; l'agrégat se fait par famille et par année ; le service reconstruit la ligne de l'année en cours (dépensé, transactions, étiquettes) et la liste `spentByYear` des dépenses seules. Une famille sans dépense sur l'année en cours reste absente, comme aujourd'hui. Une CTE `exceptional_year` à côté de `real_year`, même filtre de dates et de comptes, jointe sur `exceptional_tx` (la règle de la requête 1 : étiquette `is_exceptional`), dépenses seules, nettes. Toujours une seule requête SQL.
- `frontend/src/lib/api.ts` : les deux champs.
- `docs/mcp.md`, ligne de `get_dashboard_summary` : nommer `spentByYear` et `exceptionalExpensesOfYear`.
- Tests `dashboard.service.spec.ts` : une famille avec deux années (l'ancienne non comptée dans `spent`, présente dans `spentByYear`) ; une famille sans dépense cette année absente ; `exceptionalExpensesOfYear` égal à la somme des dépenses exceptionnelles datées de l'année, familles et sans famille ; null sans famille ; les golden masters du tableau de bord sans famille inchangés.
- Vérification : `pnpm --filter backend test`, `pnpm --filter backend lint`, `pnpm --filter backend build`, `pnpm --filter frontend type-check`.

### Lot 1 : le graphique des années

`frontend/src/components/charts/YearColumnsChart.vue` et sa spec. Indépendant du lot 0.

- Props : `years: { year: number; amount: number }[]` (déjà continues et triées, le composant ne comble rien), `currentYear: number`, `color: string` (l'année en cours), `envelope?: number`, `label: string` (le graphique en mots, pour `aria-label`).
- SVG `role="img"`, colonnes de 30 px au pas de 42 px, hauteur de tracé 48 px plus une ligne d'étiquettes d'année à 10 px ; échelle = max des montants et de l'enveloppe ; une colonne à 0 garde 2 px pour exister. Année en cours dans `color`, années passées `gray-400` clair / `slate-500` sombre ; étiquette de l'année en cours en gras. Enveloppe : ligne pointillée dans l'encre des étiquettes, texte « enveloppe 600 € » à droite au-dessus du trait ; la part d'une colonne au-dessus du trait en `red-500`. Un `<title>` par colonne (« 2025 : 684,00 € », « 2025 : dépassement de 84,00 € »).
- Tests : hauteurs proportionnelles ; colonne à 0 ; année en cours colorée et les autres grises ; enveloppe absente sans prop, présente avec ; dépassement rouge seulement au-dessus du trait ; `aria-label` porté.
- Vérification : tests, type-check, lint.

### Lot 2 : la carte

`TagFamiliesOfYearCard.vue`, sa spec, `DashboardPage.spec.ts`. Dépend des lots 0 et 1.

- Nouvelle prop `exceptionalExpenses: number | null`, passée par `DashboardPage.vue` depuis `useDashboardData` (`exceptionalExpensesOfYear`, à exposer comme `realExpensesOfYear`).
- Tête de carte : titre et sous-titre inchangés, puis la phrase `families-of-year-header` (total des familles, part de l'exceptionnel avec le montant, part du réel), la barre `families-of-year-stack` (`role="img"`, `aria-label` listant les tranches, une tranche `families-of-year-stack-slice-{id}` par famille avec `title`, largeur minimale 3 px, le reste `families-of-year-stack-rest` dans la couleur de la piste), et sous la barre, seulement quand le reste est positif, « Le gris : X € d'exceptionnel sans famille. »
- Ligne de famille : nom et pastille, figure et lien comme aujourd'hui ; dessous, `YearColumnsChart` (`family-of-year-years-{id}`) alimenté par `spentByYear` complété des années manquantes à 0, six au plus ; dessous, la ligne de faits (part de l'exceptionnel, étiquettes, transactions, moyenne des années passées ou « première année », reste ou dépassement). `scale`, `width` et la barre `family-of-year-bar-*` disparaissent.
- Téléphone : le graphique sous le nom et la figure, sur sa propre ligne, la grille de la carte reste une colonne sous `md`.
- Tests : la tranche d'une famille vaut `spent / exceptionalExpenses` ; le reste vaut le complément et sa phrase n'apparaît pas à 0 ; la phrase de tête porte les deux pourcentages ; faits avec « première année », avec la moyenne, avec le reste, avec le dépassement en rouge ; `YearColumnsChart` reçoit les années continues et l'enveloppe ; `DashboardPage.spec.ts` passe la nouvelle prop. `docs/mcp.md` n'est pas touché par ce lot.
- Vérification : tests, type-check, lint, la carte en local sur le compte démo (familles Voyages, Compétitions, Fêtes de la seed) sur une période qui touche une étiquette exceptionnelle, clair et sombre, bureau et téléphone.

## Hors périmètre

- Une enveloppe par année (historique de `annualBudget`) : une seule valeur aujourd'hui, tracée sur toutes les années.
- La page de famille et sa répartition par année, qui reste la vue détaillée.
- Les étiquettes exceptionnelles sans famille dans la carte : le gris les somme, il ne les nomme pas ; la page Étiquettes le fait.
