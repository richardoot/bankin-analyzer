# Familles d'étiquettes

Rédigé le 2026-10-19. Aucune branche ouverte. Fait suite au [cadre des catégories](category-framework.md) et au [cadre des achats lissés](amortization-framework.md), dont il reprend la règle : chaque entité répond à une seule question sur une transaction, et un attribut de calcul se pose sur l'entité qui porte la question.

## Le problème

Richard veut lire ses étiquettes à un étage au-dessus : « combien m'ont coûté les vacances en 2025, réparties par catégorie », « combien me coûte une HYROX en moyenne », et une page Étiquettes rangée par genre plutôt qu'une grille alphabétique.

Ce que les étiquettes réelles disent (restauration de la production du 2026-10-19, les deux comptes) :

| Fait                                            | Mesure                                                         |
| ----------------------------------------------- | -------------------------------------------------------------- |
| Étiquettes                                      | 27, deux comptes                                               |
| Étiquettes datées                               | 15, toutes exceptionnelles                                     |
| Compétitions HYROX par compte                   | 4, sur deux saisons                                            |
| Enveloppe renseignée (`budgetAmount`)           | 0 sur 27                                                       |
| Étiquettes vides                                | 4 (une HYROX passée, « Pro », « Chloé », « Gros Achats 2026 ») |
| Mêmes événements étiquetés sur les deux comptes | HYROX Lyon 2026, Rome 2026                                     |

Les noms encodent déjà le genre et l'édition : « HYROX Paris 2025 », « Voyage Prague 2025 », « Concert Bad Bunny Paris 2026 ». Le genre n'est lisible que par un humain, aucun calcul ne peut le regrouper. Et les étiquettes se rangent en trois natures que la page mélange :

| Nature              | Exemples                                                 | Ce qui la caractérise                          |
| ------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| Événement daté      | HYROX, voyages, concerts, Fêtes de Bayonne               | exceptionnel, fenêtre, éditions qui reviennent |
| Épisode sans date   | Achats Logement 2026, Gros achats appartement            | exceptionnel, pas de fenêtre                   |
| Thème au long cours | Cadeaux, Parents, Chloé, Pro, Remboursements (non actif) | ni exceptionnel ni daté, pas d'édition         |

Deux lectures à retenir pour la suite. Le motif « même événement, nouvelle édition » est la norme, pas l'exception. Et personne ne budgète un événement à l'unité : l'enveloppe par étiquette, livrée avec le tag exceptionnel, n'a jamais été remplie.

## Décisions

Une nouvelle entité, la **famille**, attribut facultatif de l'étiquette.

| Entité           | Question                                             | Qui définit                  |
| ---------------- | ---------------------------------------------------- | ---------------------------- |
| Tag              | Dans quel contexte ? (événement daté, projet, thème) | Utilisateur                  |
| Tag exceptionnel | Vie courante ou épisode ?                            | Utilisateur, par transaction |
| Famille          | Quel genre de contexte ? (voyages, HYROX, concerts)  | Utilisateur                  |

Le mot « type » est évité : dans le cadre des catégories, le type d'une transaction répond déjà à « quel flux ? » (dépense, revenu, transfert). Une famille d'étiquettes est une autre question.

Règles :

- **Définie par l'utilisateur**, comme l'étiquette. Le cadre impose les catégories parce que les calculs lisent leurs attributs ; la famille ne porte qu'un regroupement et une enveloppe, elle n'a pas à être imposée. « HYROX » n'entrerait dans aucune énumération et c'est pourtant la question posée.
- **Un seul niveau.** Une étiquette appartient à zéro ou une famille. Pas de famille de familles, sinon on recrée catégorie et sous-catégorie à côté du catalogue.
- **Aucune famille ne nomme une finalité.** « Voyages », « HYROX », « Concerts » disent un contexte ; « Restaurants » ou « Transport » sont des catégories et restent interdites, par la même règle que pour les étiquettes.
- **La famille ne change aucun calcul existant.** Vie courante, base de référence, surcoût, réserve projets lisent toujours l'étiquette. L'analyse d'une famille est l'union des étiquettes qu'elle contient.
- **Une transaction compte une fois par famille.** Deux étiquettes de la même famille sur une même ligne (une HYROX et son déplacement, si l'utilisateur les sépare) ne la comptent pas deux fois. Deux familles différentes la comptent chacune, comme deux étiquettes aujourd'hui.
- **Pas de famille par défaut écrite en base.** Le formulaire propose des noms (« Voyages », « Compétitions », « Concerts et fêtes ») mais ne crée rien tant que l'utilisateur n'a pas choisi. Une famille vide n'a pas de sens, et le seed du catalogue a montré ce que des lignes vides coûtent en nettoyage. Les 27 étiquettes existantes seront rattachées à la main dans l'écran, pas par script.
- **Pas de « Gros achats » proposé.** Le cadre des achats lissés dit qu'un bien durable se lisse et ne s'étiquette pas. Les épisodes sans date restent possibles (travaux d'installation d'un logement) mais le formulaire ne les encourage pas. La relecture des étiquettes exceptionnelles notée dans ce cadre reste à faire.
- **L'année d'un événement est celle de sa fenêtre**, pas celle de ses paiements. Rome 2026 est payé en octobre pour décembre ; un voyage de janvier 2027 payé en novembre 2026 sort de la trésorerie 2026 mais appartient aux vacances 2027. Une étiquette sans fenêtre prend l'année de chaque transaction. L'analyse offre les deux lectures, « année de l'événement » par défaut, « trésorerie » en bascule, comme le Budget offre vie courante et réel.
- **L'enveloppe se pose sur la famille, par an.** « Voyages : 4 000 € par an » est la question que l'utilisateur se pose ; « Rome : 1 200 € » ne l'est pas, les données le montrent. L'enveloppe par étiquette reste lue et modifiable mais quitte le formulaire de création ; elle n'est montrée qu'aux étiquettes qui en portent une.

## Modèle

Table `tag_families` (schéma `app`) : `id`, `user_id`, `name`, `color`, `icon`, `annual_budget DECIMAL(12,2)` nullable, `created_at`, `updated_at`. Unique `(user_id, name)`, comme les étiquettes.

Colonne `tags.family_id` nullable, clé vers `tag_families`, `ON DELETE SET NULL` : supprimer une famille rend ses étiquettes orphelines, jamais ne les supprime. Index sur `family_id`.

Rien d'autre ne bouge : `transaction_tags`, le drapeau exceptionnel, la fenêtre, l'enveloppe par étiquette restent où ils sont.

## Calcul

Tout se fait à la lecture.

- **État d'une étiquette datée**, calculé côté serveur et rendu dans `TagResponseDto` (`status`) : `upcoming` si la fenêtre commence après aujourd'hui, `ongoing` si aujourd'hui est dedans, `past` sinon. Une étiquette sans fenêtre n'a pas d'état.
- **Année d'une étiquette datée** : l'année de `event_start_date`. Un événement à cheval sur deux années (réveillon) compte pour l'année de son début.
- **Analyse d'une famille** (`GET /tag-families/:id/analysis?year=&basis=event|cash`) : mêmes conventions que l'analyse d'une étiquette (dépenses en valeur absolue nettes des remboursements, comme le tableau de bord et le budget ; division par le diviseur du compte ; comptes exclus des statistiques ignorés ; un revenu entièrement tiré pour rembourser n'est ni compté ni listé), agrégées sur `DISTINCT transaction_id` parmi les étiquettes de la famille. Rend : totaux, répartition par catégorie, répartition par année, et une ligne par étiquette (nom, fenêtre, jours, dépensé, dépensé par jour, surcoût, enveloppe). Le surcoût d'une édition vient de la base de référence déjà calculée par `TagsService.computeBaseline`, appelée par étiquette datée ; la famille ne refait pas ce calcul, elle somme.
- **Comparaison des éditions** : moyenne et médiane par édition, moyenne par jour de fenêtre, édition la plus et la moins chère. Calculées dans le service sur la liste par étiquette, pas en SQL.
- **Enveloppe annuelle** : consommée par le dépensé de la famille sur l'année, dans la lecture choisie. Dans la réserve projets d'un plan (`budget-plans.service.ts`, `projectReserve`), une famille à enveloppe compte `annual_budget × mois du plan / 12` à la place de la somme des enveloppes de ses étiquettes ; une étiquette sans famille, ou dont la famille n'a pas d'enveloppe, garde la règle d'aujourd'hui.

Invariants à tester :

- Le total d'une famille égale la somme de ses étiquettes quand aucune transaction n'en porte deux ; il lui est inférieur sinon, de la part partagée exactement.
- La somme des années d'une famille égale son total, dans chaque lecture.
- En lecture trésorerie, le total d'une famille sur une année égale ce que `GET /transactions?tagFamilyId=&startDate=&endDate=` liste.
- Le Budget et le Dashboard sont identiques avant et après la fonctionnalité pour un utilisateur sans famille (golden masters).

## Écrans

- **Page Étiquettes** en trois sections : Événements (étiquettes datées, à venir d'abord, puis en cours, puis passées par date décroissante), Épisodes sans date (exceptionnelles sans fenêtre), Thèmes (le reste). Badge d'état sur chaque carte d'événement. Filtre par année en tête de la section Événements. Une étiquette sans transaction le dit sur sa carte. Une fois les familles là, la section Événements se groupe par famille, les étiquettes sans famille en dernier sous « Sans famille ».
- **Formulaire d'étiquette** : un champ Famille avec les familles existantes, « Nouvelle famille… » qui crée en ligne, et les noms proposés quand l'utilisateur n'en a aucune. L'enveloppe par étiquette quitte le formulaire de création ; elle reste dans le formulaire de modification quand elle est renseignée.
- **Page de famille** (`/tags/families/:id`) : en-tête (nom, couleur, enveloppe annuelle et consommation de l'année), sélecteur d'année et bascule événement / trésorerie, répartition par catégorie, tableau des éditions (nom, période, jours, dépensé, par jour, surcoût, lien vers l'étiquette et vers ses transactions), encart de comparaison. Lien « voir les transactions » de la famille sur l'année.
- **Liste des transactions** : filtre `tagFamilyId`, lien `family=` dans `transactionsLink`, chip de filtre nommant la famille.
- **Nouvelle édition** : sur la carte d'une étiquette passée, « Nouvelle édition » ouvre le formulaire pré-rempli (famille, couleur, exceptionnel) avec le nom où l'année est incrémentée quand elle se termine par quatre chiffres, et une fenêtre vide.
- **Page Budget** : la section « Projets de la période » affiche une famille à enveloppe comme une ligne (prorata, dépensé, étiquettes de la période dessous), les étiquettes sans famille comme aujourd'hui.
- **Tableau de bord** : carte « Épisodes de l'année », une barre par famille sur l'année en cours, part dans le réel, lien vers la page de famille. Apparaît seulement quand une étiquette exceptionnelle touche la période, comme le sélecteur de lecture.

## MCP

Le serveur ne sait aujourd'hui ni lister ni poser une étiquette ; le cadre des achats lissés l'a noté (« la réponse épisode se pose dans l'application »). Trois outils :

- `get_tags` : les étiquettes et leur famille, état, fenêtre, nombre de transactions, dépensé.
- `set_transaction_tags` : `transactionId`, `add` et `remove` par id d'étiquette, garde-fou `expectedAmount` comme les autres écritures, refus croisé avec le lissage rendu par le service (mêmes mots que l'écran). Pas de création d'étiquette ni de famille par le MCP : une édition se crée dans l'application, une fois.
- `get_tag_candidates` : pour une étiquette datée, les dépenses variables tombant dans sa fenêtre élargie de deux jours de chaque côté, sur un compte compté, qui ne portent pas déjà l'étiquette. En lecture seule, pour que l'agent propose avant de rattacher. Le déplacement acheté des mois avant (train, avion, inscription) n'y est pas : il reste à chercher par marchand.

## Lots

**Lot 0, page rangée, sans modèle.** `status` dans `TagResponseDto`. Trois sections, badges, filtre par année, mention des étiquettes vides. Tests du calcul d'état (bornes du jour, fenêtre d'un seul jour) et de la page.

**Lot 1, famille.** Migration `tag_families` et `tags.family_id`. `GET/POST/PATCH/DELETE /tag-families`, `familyId` dans les DTO d'étiquette. Champ Famille du formulaire avec création en ligne et noms proposés. Page groupée par famille. Filtre `tagFamilyId` des transactions et lien. Refus 409 sur un nom en double, 404 sur une famille d'un autre utilisateur.

**Lot 2, analyse de famille.** `GET /tag-families/:id/analysis`, page de famille, comparaison des éditions, lectures événement et trésorerie. Tests des invariants, dont la transaction portée par deux étiquettes de la même famille.

**Lot 3, enveloppe annuelle.** `annualBudget` dans les DTO, en-tête de la page de famille, prorata dans la réserve projets et section Projets du Budget. L'enveloppe par étiquette quitte le formulaire de création. Golden masters du plan inchangés sans famille.

**Lot 4, nouvelle édition et MCP.** Bouton « Nouvelle édition ». Outils `get_tags`, `set_transaction_tags`, `get_tag_candidates`, décrits dans `docs/mcp.md`.

**Lot 5, tableau de bord.** Carte « Épisodes de l'année ».

Chaque lot livre ses tests (`pnpm --filter backend test`, `pnpm --filter frontend test`) avant le suivant. Lots 0 et 1 sur une branche `feat/tag-families`, fusionnés ensemble ; les suivants un par un.

## Hors périmètre, noté pour plus tard

- **Étiquette partagée entre deux utilisateurs.** Les deux comptes étiquettent séparément les mêmes événements (HYROX Lyon 2026, Rome 2026) et le compte joint est déjà divisé par deux dans les calculs. Une étiquette commune donnerait le coût total de l'événement pour le couple. Autre chantier, qui touche au modèle d'utilisateur.
- **Relecture des étiquettes exceptionnelles sans date** (« Achats Logement 2026 », « Gros achats appartement ») : la requête `scripts/review-exceptional-tags.sql` du cadre des achats lissés reste à passer.
- **Modèle d'édition** : mémoriser les catégories habituelles d'une famille (inscription, déplacement, hébergement) pour pré-remplir les candidats d'une nouvelle édition. Attendre d'avoir vu l'usage de `get_tag_candidates`.

## Points à trancher

- Une famille supprimée : rendre ses étiquettes orphelines (décision ci-dessus) ou refuser tant qu'elle en a, comme une sous-catégorie du catalogue. Orphelines, parce que la famille n'est qu'un regroupement et que rien ne dépend d'elle pour un calcul.
- L'enveloppe annuelle en lecture trésorerie : un voyage de janvier payé en novembre consomme l'enveloppe de quelle année ? Événement, par cohérence avec l'année de l'étiquette ; la bascule trésorerie ne touche que l'affichage des montants, pas l'imputation de l'enveloppe.
- Un thème (« Cadeaux ») peut-il avoir une famille ? Rien ne l'interdit dans le modèle ; l'écran ne le propose pas, le groupement par famille ne s'applique qu'à la section Événements. À revoir si un usage apparaît (« Cadeaux Noël 2026 » comme édition d'une famille « Cadeaux »).

## Décisions du lot 3 et du lot 4

Décisions des lots précédents, notées ici faute de place ailleurs :

- **Le champ Famille n'est proposé qu'aux étiquettes exceptionnelles** (lot 1). Une famille groupe des événements ; un thème n'est l'édition de rien. Le serveur l'accepte sur toute étiquette, l'écran ne l'envoie que pour une exceptionnelle.
- **Une ligne portée par deux éditions datées de la même famille** (une édition et l'acompte de la suivante) compte pour l'année de la date de début la plus ancienne (lot 2), une seule fois.

Décisions du lot 3 :

- **Le prorata vit dans `getBudgetSummary`** (`GET /tags/budget-summary`), pas dans `budget-plans.service.ts`. La page Budget retranche le `totalBudget` de ce résumé de la réserve projets du plan (`BudgetProjectsSection.vue`) ; le plan reste ignorant des étiquettes et des familles, et l'effet à l'écran est le même que prévu au chapitre Calcul.
- **Une famille à enveloppe sans étiquette dans la fenêtre apparaît quand même**, avec son prorata et un dépensé nul : « 4 000 € par an » engage la réserve à lui seul.
- **`spentEventBasis` compte les dépenses seules** : les dépenses de l'année d'événement, en valeur absolue et nettes des remboursements, sans déduire les revenus étiquetés.

Décisions du lot 4 :

- **Nouvelle édition** : le bouton n'apparaît que sur une carte `past`. Il remplit le formulaire de création existant (même famille, couleur, icône, exceptionnel coché, fenêtre vide, pas d'enveloppe) l'ouvre (il est replié sur téléphone), le fait défiler à l'écran et place le focus sur le nom. L'année n'est incrémentée que si le nom se termine par exactement quatre chiffres précédés d'un non-chiffre (`nextEditionName`, `tagFormModel.ts`) : « Vol AF12345 » ou « HYROX 2025 Paris » restent tels quels.
- **`get_tag_candidates`, « variable »** : exclut une ligne dont le rythme effectif est engagé, par la règle commune `EFFECTIVE_RHYTHM` (`recurrence-rhythm.sql.ts`, celle du tableau de bord) : sous-catégorie ou catégorie `COMMITTED`, ou ligne d'une récurrence active ou arrêtée. Les lignes non classées (rythme nul) restent : une dépense d'événement est souvent encore à classer. Chaque ligne porte son `rhythm`. Les lignes lissées restent aussi, avec `amortizationMonths`, pour que l'agent sache qu'elles refuseront une étiquette exceptionnelle.
- **Fenêtre élargie** : bornes à J-2 et J+2 incluses, la borne haute est exclusive au lendemain de J+2 pour compter une ligne horodatée en fin de journée.
- **`spent` dans `get_tags`** : `TagsService.spentByTag`, une requête groupée pour toutes les étiquettes, dépenses seules en valeur absolue divisées par le diviseur du compte, comptes exclus ignorés ; les mêmes conventions que `totalExpenses` de l'analyse d'une étiquette. `TagResponseDto` ne change pas.
- **`set_transaction_tags` sans écriture partielle** : transaction, garde-fou et propriété de chaque étiquette sont vérifiés avant d'écrire ; les étiquettes exceptionnelles sont posées en premier, si bien que le refus croisé de `attachTransactions` (mots du service) tombe avant toute écriture. Pas de transaction base de données englobante : les écritures passent par les méthodes existantes du service, une à une.
- **Idempotence** : une étiquette déjà présente ou déjà absente est rendue dans `alreadyPresent` / `alreadyAbsent` ; un appel qui n'a rien à faire répond `unchanged` sans écrire.

Décisions du lot 5 :

- **Année civile en cours à Paris**, pas l'année de la période choisie : la carte « Épisodes de l'année » lit toujours l'année de la date du jour à Paris (`calendarDayIn`, comme l'état d'une étiquette), parce que l'enveloppe est annuelle. Le 31 décembre à 23 h 30 UTC, c'est déjà l'année suivante.
- **Lecture année de l'événement**, la règle du lot 2 : une ligne appartient à l'année où commence son étiquette datée de la famille (la plus ancienne si elle en porte deux), à sa propre année sinon ; une fois par famille. Le CTE `family_tx` est partagé avec l'analyse de famille (`tag-families/family-transactions.sql.ts`).
- **Champs** de `POST /dashboard/summary` : `tagFamiliesOfYear` (une ligne par famille ayant des dépenses sur l'année, tri par dépensé décroissant : `id`, `name`, `color`, `icon`, `year`, `spent`, `annualBudget`, `remaining`, `transactionCount`, `tagCount`) et `realExpensesOfYear`. Sans famille, `[]` et `null`, et aucune requête de plus que la lecture des familles ; avec des familles, une seule requête SQL.
- **`spent` compte les dépenses seules** (valeur absolue nette des remboursements, diviseur, comptes exclus ignorés), les conventions de l'analyse de famille. `transactionCount` compte dépenses et revenus de la famille sur l'année, `tagCount` les étiquettes de la famille portées par ces lignes.
- **Dénominateur de la part** : `realExpensesOfYear`, toutes les dépenses datées de l'année civile (exceptionnelles comprises, sans lissage), nettes des remboursements selon les filtres, comptes exclus ignorés : ce que `totalExpenses` lirait sur l'année. La part est en année d'événement sur année de paiement ; elle peut donc, à la marge, ne pas se sommer exactement.
- **Condition d'affichage** : la carte n'apparaît que si une étiquette exceptionnelle touche la période (`hasExceptionalExpenses`, comme le sélecteur de lecture) et qu'au moins une famille a dépensé sur l'année. Elle se place sous la structure des dépenses, une colonne sous `md`, deux au-delà.
- **Barres** sur une échelle commune en euros (le plus grand dépensé ou la plus grande enveloppe), l'enveloppe dessinée derrière la barre ; rouge et « dépassement de X € » en dépassement. Décoratives (`aria-hidden`).
- **Lien « voir les transactions »** de la famille sur l'année (`from`/`to` du 1er janvier au 31 décembre) : la liste lit les dates de paiement, la carte le dit en pied.

## Décision du 2026-10-20 : les étiquettes lisent net, comme le tableau de bord

Avant cette date, toutes les lectures d'étiquettes (analyse d'une étiquette, d'une famille, base de référence du surcoût, section Projets du Budget, `get_tags`, événements et familles du tableau de bord) comptaient les dépenses brutes et les revenus entiers, alors que le tableau de bord et le budget passent par la règle partagée `netAmountSql` (`reimbursements/reimbursement-credit.sql.ts`). Depuis :

- **Une dépense étiquetée est nette des remboursements** reçus en espèces, et de ce qui reste dû quand la préférence de l'utilisateur le demande (la même règle que le tableau de bord par défaut). `TagNettingService` (`tags/tag-netting.service.ts`) résout la règle une fois par lecture et la fournit aux requêtes.
- **Un revenu entièrement tiré pour rembourser une dette n'est ni compté ni listé** (`visibleRowSql`) : il est déjà déduit de la dépense qu'il rembourse. Un revenu tiré en partie reste pour son reliquat.
- **La base de référence** du surcoût est nette elle aussi : un surcoût compare du net à du net.
- Le tableau de bord nette ses événements et ses familles de l'année avec la règle de la période affichée (`deductReimbursements` compris).
