# Connecteur MCP

Le backend expose un serveur MCP sur `POST /mcp` (et `GET /mcp`), en HTTP « streamable », sans
session : chaque appel d'outil est une requête complète, authentifiée par `McpAuthGuard`
(jeton Supabase de l'utilisateur). La découverte OAuth est servie par
`/.well-known/oauth-protected-resource` (`WellKnownController`).

Code : `backend/src/mcp/`. Les outils sont déclarés dans `mcp.controller.ts`, la résolution des
cibles de classement dans `filing-target.ts`.

Les données de l'utilisateur sont rendues en JSON dans une balise `<user_financial_data>`, pour
que le modèle les lise comme des données et non comme des instructions.

## Outils de lecture

| Outil                       | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_transactions`          | Transactions paginées (50 par défaut, 100 au plus). Filtres : `type` (`EXPENSE`, `INCOME`, `TRANSFER`), `startDate`, `endDate`, `categoryKey`, `categoryId`, `categoryName`, `subcategoryId`, `search`, `account`, `amortized` (`true` : les dépenses lissées seulement). Chaque ligne porte `id`, `accountId`, `categoryId`, `categoryKey`, `subcategoryId`, `subcategoryKey`, `amortizationMonths`.                                                                                                                                            |
| `get_transaction`           | Une transaction par `id` : type, classement complet avec les clés, `nature` et `rythme` effectifs, note, tags, demandes de remboursement qui la portent, règlements qu'elle paie (pour un revenu), `amortizationMonths` (null si la dépense n'est pas lissée) et, pour une dépense, `suggestedAmortizationMonths`. À appeler avant et après une écriture.                                                                                                                                                                                        |
| `get_categories`            | Toutes les catégories avec `catalogKey`, `isLocked`, `isLegacy`, `defaultNature`, `defaultRhythm`, et leurs sous-catégories (`catalogKey`, `nature`, `rhythm`, `isLocked`).                                                                                                                                                                                                                                                                                                                                                                      |
| `get_persons`               | Les personnes (`id`, `name`) à qui une dépense peut être réclamée.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `get_reimbursements`        | Demandes de remboursement, par `transactionId`, par `personId`, et filtrées par `status` (`PENDING`, `PARTIAL`, `COMPLETED`).                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `get_budget_statistics`     | Moyennes de dépenses et revenus par catégorie sur une période, remboursements déduits. Les transferts n'y figurent pas.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `get_dashboard_summary`     | Dépenses et revenus par mois et par catégorie, structure des dépenses (dont la part récurrente), épargne, ce qui reste dû. Les transferts sont hors des dépenses et des revenus. Porte aussi `tagFamiliesOfYear` : les familles d'étiquettes qui ont des dépenses dans l'année civile en cours (à Paris, quelle que soit la période demandée), chacune avec `spent`, `annualBudget`, `remaining`, `transactionCount`, `tagCount`, et `realExpensesOfYear`, les dépenses réelles de cette année (null sans famille), dont `spent` se lit en part. |
| `get_smoothing_suggestions` | Les dépenses récentes (`months`, 6 par défaut, 24 au plus) qui dépassent largement l'habitude de leur sous-catégorie, pas encore tranchées, chacune avec une question et deux réponses. Voir « Lissage » plus bas.                                                                                                                                                                                                                                                                                                                               |
| `get_recurrences`           | Charges récurrentes détectées ou suivies (abonnements, loyer, assurances) : `name` (nom du service), `label` (libellé bancaire), catégorie, `period`, `amount`, `monthlyEquivalent`, `occurrences`, `totalPaid`, `firstDate`, `lastDate`, `nextExpected`, `status` (`ACTIVE`, `STOPPED`, `CANDIDATE`, filtrable), et le `monthlyTotal` des actives.                                                                                                                                                                                              |
| `get_spending_trends`       | Ce qui change dans les dépenses, la liste de la carte « Ce qui change » : un mois clos (`month`, défaut le dernier) contre la médiane des `window` mois complets précédents (3, 6 par défaut, 12), en lecture `everyday` (défaut) ou `real`. Rend `insights` en entier, `quietSentence`, `horizons`, `completeMonths`, `availableMonths`. Voir « Tendances » plus bas.                                                                                                                                                                           |
| `get_tags`                  | Les étiquettes : `id`, `name`, `color`, `isExceptional`, `eventStartDate`, `eventEndDate`, `status` (`upcoming`, `ongoing`, `past`, null sans fenêtre), `family` (`id`, `name`, `annualBudget`, ou null), `transactionCount`, `spent` (dépenses nettes des remboursements, comme le tableau de bord, part du compte joint, comptes exclus des statistiques ignorés). Filtres : `status`, `familyId`, `isExceptional`.                                                                                                                            |
| `get_tag_candidates`        | Pour une étiquette datée (`tagId`), les dépenses qui pourraient lui appartenir et ne la portent pas encore. Voir « Étiquettes et familles » plus bas.                                                                                                                                                                                                                                                                                                                                                                                            |

`categoryName` dans `get_transactions` suit la même règle de nom que les écritures (ci-dessous) ;
quand le filtre `type` est donné, seules les catégories de ce type sont candidates, ce qui
départage un nom porté par une catégorie de dépense et une de revenu.

## Outils d'écriture

Cinq écritures, toutes réversibles : reclasser, demander, régler, lisser, étiqueter. Il n'y a **aucun outil de suppression** : supprimer une
transaction, une demande ou un règlement reste dans l'application.

### Désigner une cible

Une catégorie se désigne par **une seule** de ces trois façons : `categoryKey` (clé du
catalogue, `housing`, `adjustment`… — la façon recommandée, identique dans tous les comptes),
`categoryName` ou `categoryId`. Une sous-catégorie de même : `subcategoryKey`
(`housing.rent`), `subcategoryName` ou `subcategoryId`. Les noms se comparent sans casse, sans
accents et sans espaces superflus. `categoryKey: null` ou `categoryId: null` **déclasse** la
transaction (« à classer ») ; une sous-catégorie ne s'y ajoute pas. L'outil ne devine jamais ;
il refuse :

- aucune désignation de catégorie, ou plusieurs pour le même niveau ;
- une clé inconnue du catalogue ; une clé que le catalogue connaît mais que l'utilisateur n'a
  pas (catalogue non provisionné : script `provision-category-catalog.ts`) ; une clé de
  sous-catégorie qui n'appartient pas à la catégorie cible ;
- une catégorie inconnue de l'utilisateur, ou un nom porté par plusieurs catégories (le nom n'est
  unique que par type) : il faut alors passer `categoryId`, que le message d'erreur liste ;
- une sous-catégorie inconnue, ou qui n'appartient pas à la catégorie cible. Une sous-catégorie
  par nom est cherchée dans la catégorie cible seulement.

Sans sous-catégorie, la transaction est classée dans la catégorie seule et perd l'ancienne
sous-catégorie. Une catégorie ou une sous-catégorie ne se crée pas par le MCP.

### `set_transaction_category`

`transactionId`, la cible, et les garde-fous `expectedCategoryName` ou `expectedCategoryKey`
(optionnels, recommandés ; le nom est le seul repère d'une catégorie héritée, sans clé).

Déroulé : lecture de la transaction, garde-fous, règle de type, écriture par
`TransactionsService.update`. La règle de type :

- une dépense va dans une catégorie de dépense **ou de transfert**, un revenu dans une catégorie
  de revenu **ou de transfert** ; jamais de dépense vers un revenu ni l'inverse ;
- sous un transfert la transaction **devient TRANSFER** et sort des totaux ; un transfert ne
  revient que du côté que son signe indique (montant négatif : dépense) ; déclassé, il reprend
  ce type ;
- une transaction liée au registre des remboursements ne peut pas devenir un transfert : une
  dépense qui porte une demande, un revenu qui règle une demande. Supprimer d'abord la demande
  ou le règlement dans l'application.

La réponse donne `status` (`updated` ou `unchanged`), la transaction, et le classement `before`
et `after` avec le **type**, les noms, les identifiants et les clés. Une cible identique au
classement actuel n'écrit rien et répond `unchanged`.

**Annuler** : rappeler l'outil avec `categoryId` et `subcategoryId` de `before` (ou
`categoryKey: null` si la ligne était à classer).

### `set_transactions_category`

Mêmes paramètres, `transactionIds` (1 à 50) à la place de `transactionId`. La cible est résolue
une fois ; chaque ligne est ensuite traitée comme ci-dessus, dans l'ordre, et rapportée seule :
`{ transactionId, status: 'updated' | 'unchanged' | 'refused', reason?, before?, after? }`, plus
un compte par statut. Une ligne refusée n'arrête pas les suivantes. Pas de tout-ou-rien : chaque
ligne est réversible et l'agent voit ce qui a été fait.

### `create_reimbursement_request`

`transactionId` (une dépense), `personId` (voir `get_persons`), `amount` (> 0), `note`
(optionnel), `expectedAmount` (optionnel : montant absolu de la transaction).

Refuse un revenu, un garde-fou qui ne correspond pas, et une seconde demande pour la même personne
sur la même transaction (un lot rejoué doublerait la dette). Le service refuse en plus un total de
demandes supérieur à la dépense. Réponse : la demande créée (`id`, `amount`, `status`, `person`) et
la transaction.

### `settle_reimbursements`

`incomeTransactionId` (un revenu), `personId`, `reimbursements`
(`[{ reimbursementId, amountSettled, forceComplete? }]`, 1 à 50), `note` (optionnel).

Avant d'écrire, l'outil compare la somme réglée au disponible du revenu et refuse en donnant ce
disponible. `SettlementsService.create` porte les autres contrôles : transaction qui n'est pas un
revenu, personne inconnue, demande d'une autre personne, demande créditée au-delà de son montant.
Réponse : le règlement (`id`, `settledAt`, `amountUsed`, lignes avec leur nouveau statut et leur
reste dû) et `incomeAvailableAfter`.

### `set_transaction_amortization`

`transactionId`, `months` (entier de 2 à 60, ou `null` pour arrêter le lissage), `expectedAmount`
(optionnel : montant absolu de la transaction).

Lisse une dépense en vie courante : à partir du mois de sa date, chaque mois compte une tranche
égale au net (remboursements demandés déduits, part du compte joint) divisé par `months`. Le mode
Réel, la liste et les soldes ne bougent pas. L'écriture passe par `TransactionsService.update`, qui
porte les refus, rendus avec leurs mots : durée hors bornes, revenu ou transfert, transaction qui
porte une étiquette exceptionnelle. Réponse : `status` (`updated` ou `unchanged`), la transaction,
`before` et `after` (`amortizationMonths`). **Annuler** : rappeler l'outil avec le `before`.

### `set_transaction_tags`

`transactionId`, `add` et `remove` (identifiants d'étiquettes, voir `get_tags` ; l'un des deux
non vide, 50 au plus chacun), `expectedAmount` (optionnel : montant absolu de la transaction).

Tout est vérifié avant la première écriture : la transaction et chaque étiquette doivent être à
l'utilisateur, le garde-fou doit correspondre (« Garde-fou : la transaction est de X €, pas de
Y €. Rien n'a été écrit. »), une même étiquette ne peut être à la fois ajoutée et retirée.
L'écriture passe par `TagsService.attachTransactions` et `detachTransaction`. Le service refuse
une étiquette exceptionnelle sur une dépense lissée ; le refus est rendu avec ses mots, comme à
l'écran. Les étiquettes exceptionnelles sont posées en premier : un refus arrive avant toute
écriture.

Ajouter une étiquette déjà présente ou retirer une absente n'est pas une erreur : la réponse les
liste (`alreadyPresent`, `alreadyAbsent`) et répond `unchanged` si rien d'autre n'est à faire.
Sinon : `status: updated`, la transaction, `added`, `removed`, et les étiquettes `before` et
`after` (`id`, `name`, `isExceptional`). **Annuler** : rappeler l'outil en inversant `add` et
`remove`.

Le MCP ne crée ni étiquette ni famille.

### Lissage ou épisode : la règle

Le test, à appliquer avant toute écriture sur une grosse dépense : **est-ce que ça reviendra sous
une forme comparable dans les deux à trois ans ?** (`agent-os/product/amortization-framework.md`)

- **Épisode** (voyage, mariage, déménagement, compétition, fête) : non. Étiquette exceptionnelle,
  hors vie courante. Elle se pose avec `set_transaction_tags` sur une étiquette qui existe déjà ;
  l'étiquette elle-même se crée dans l'application.
- **Bien durable renouvelé** (téléphone, ordinateur, électroménager, mobilier, vélo, équipement de
  sport) : oui. Lissage sur la durée d'usage (téléphone, ordinateur 24 à 36 mois ; électroménager,
  mobilier 36 à 60). Jamais exceptionnel.
- **Imprévu subi** (réparation auto, dentiste, amende, chaudière) : oui, sous une autre forme.
  Reste en vie courante, lissé sur 6 à 12 mois si le montant déforme le plan. Jamais
  exceptionnel.
- Une transaction est exceptionnelle **ou** lissée, jamais les deux. Un achat payé en plusieurs
  fois ou à crédit ne se lisse pas : les échéances font déjà le travail. Seule une dépense se
  lisse.

`get_smoothing_suggestions` applique ce test aux dépenses des derniers mois. Une candidate est une
dépense d'au moins 200 € (net), ni lissée ni exceptionnelle, hors sous-catégorie d'engagement
(loyer, assurances), qui vaut plus de trois mois de ce que sa sous-catégorie a coûté sur les douze
mois précédents. Sa sous-catégorie, par clé de catalogue, choisit la question :

| Sous-catégorie                                                                                             | Question                    | Réponses                                          |
| ---------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------- |
| `shopping.tech` (24), `shopping.sports-gear` (24), `shopping.home` (48), `transport.vehicle-purchase` (60) | Achat à lisser ?            | `SMOOTH` sur la durée entre parenthèses, `KEEP`   |
| `transport.maintenance`, `housing.maintenance`, `health.optical-dental`, `taxes.fines` (12)                | Imprévu à lisser ?          | `SMOOTH` sur 12 mois, `KEEP`                      |
| toute autre                                                                                                | Épisode ou achat à lisser ? | `EPISODE`, `SMOOTH` sur 12 mois (durée à ajuster) |

L'étiquette exceptionnelle n'est jamais proposée pour un équipement ni pour un imprévu. L'outil ne
fait que lire : l'agent pose la question, l'utilisateur tranche, `set_transaction_amortization`
lisse, `set_transaction_tags` étiquette. `KEEP` (laisser à sa date) n'est pas mémorisé : la dépense reviendra dans la liste tant
qu'elle est dans la fenêtre.

## Étiquettes et familles

Une étiquette dit le contexte d'une dépense (un événement daté, un épisode, un thème) ; une
famille regroupe les éditions d'un même genre d'événement (« HYROX Paris 2025 », « HYROX Lyon
2026 » dans « Compétitions ») et peut porter une enveloppe annuelle
(`agent-os/product/tag-families.md`).

`get_tag_candidates` cherche, pour une étiquette datée, les dépenses :

| Critère        | Règle                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Date           | dans la fenêtre de l'étiquette élargie de deux jours de chaque côté, bornes incluses (`searchedFrom`, `searchedTo`)               |
| Type           | `EXPENSE` seulement                                                                                                               |
| Compte         | compté dans les statistiques (`isExcludedFromStats = false`)                                                                      |
| Déjà étiquetée | exclue si elle porte déjà l'étiquette                                                                                             |
| Rythme         | exclue si son rythme effectif est engagé : sous-catégorie (ou catégorie) `COMMITTED`, ou ligne d'une récurrence active ou arrêtée |

Chaque ligne porte `id`, `date`, `label`, `amount`, `accountId`, la catégorie et la
sous-catégorie avec leurs clés, `rhythm` (`VARIABLE`, ou null pour une ligne non classée) et
`amortizationMonths` (une dépense lissée ne peut pas recevoir d'étiquette exceptionnelle). Une
étiquette sans fenêtre est refusée.

La règle d'usage :

1. `get_tags` pour trouver l'étiquette (une édition passée : `status: past`).
2. `get_tag_candidates` pour proposer. Le déplacement, l'hébergement ou l'inscription achetés
   des mois avant ne sont pas dans la fenêtre : les chercher par marchand
   (`get_transactions` avec `search`).
3. L'utilisateur tranche, puis `set_transaction_tags` rattache, ligne par ligne, avec
   `expectedAmount`.
4. Une nouvelle édition se crée dans l'application (« Nouvelle édition » sur la carte de
   l'édition passée), jamais par le MCP.

## Tendances

`get_spending_trends` rend **la même réponse que l'écran** : il appelle `TrendsService.getTrends`
comme `GET /trends`, avec les mêmes défauts (dernier mois clos, 6 mois de référence, vie
courante) et les remboursements comme le tableau de bord : reçus déduits, en attente selon la
préférence de l'utilisateur. Le calcul est déterministe, sans modèle
(`agent-os/product/spending-trends.md`).

| Champ                                       | Sens                                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `insights`                                  | La liste complète des tendances qui passent leurs seuils, triée comme l'écran : les lignes à classer d'abord, puis par `score` (l'écart en euros). La carte n'en montre que les cinq premières et déplie le reste sur « Voir tout ». |
| `kind`                                      | `amount`, `frequency`, `basket`, `share`, `uncategorized`, `newHabit`, `lostHabit`, `subscription`, `price`, `shift`, `drift`, `record`, `yearAgo`, `savings`.                                                                       |
| `unit`                                      | Ce qui bouge : `type` (`category`, `subcategory`, `structure`, `uncategorized`, `merchant`, `recurrence`, `savings`), `id`, `categoryId`, `name`, et `search` pour un marchand.                                                      |
| `current`, `reference`, `delta`, `deltaPct` | La mesure du mois, celle de la référence, l'écart et l'écart relatif (null quand il n'a pas de sens). L'unité dépend de `kind` (euros, lignes, points).                                                                              |
| `sentence`                                  | La phrase de l'écran, en français.                                                                                                                                                                                                   |
| `windows`                                   | `current` (le mois lu) et `reference` (la fenêtre de référence), en dates incluses.                                                                                                                                                  |
| `quietSentence`                             | « Rien de notable en septembre : … » quand l'historique suffit et qu'aucune habitude n'a bougé ; null sinon.                                                                                                                         |
| `completeMonths`                            | Les mois complets d'historique avant le mois lu ; il en faut trois pour les tendances d'habitude.                                                                                                                                    |
| `horizons`                                  | Les comparaisons longues (pente, record, même mois l'an dernier, épargne) que l'historique ne permet pas encore, chacune avec sa phrase et ce qui manque.                                                                            |

La règle d'usage :

1. Les tendances sont **la source de tout chiffre** sur ce qui change : la conversation les cite,
   elle n'en calcule pas d'autres et n'en invente aucun. Une liste vide s'explique par
   `quietSentence`, `completeMonths` ou `horizons`, pas par une supposition.
2. Pour creuser une tendance, `get_transactions` sur `windows.current` puis
   `windows.reference` (`startDate`, `endDate`), avec `unit.categoryId` (`categoryId`),
   l'`unit.id` d'une sous-catégorie (`subcategoryId`, avec sa catégorie) ou l'`unit.search` d'un
   marchand (`search`).
3. Un mois non clos est refusé (« Refusé par le serveur : Le mois … n'est pas encore clos ») ;
   une fenêtre autre que 3, 6 ou 12, un mois mal formé ou une lecture inconnue sont refusés par le
   schéma.

Aucune écriture : une tendance ne se corrige pas, le registre oui (reclasser, lisser, étiqueter).

`digest` vaut toujours `null` : le paragraphe rédigé par l'IA sous la carte a sa propre requête
(`GET /trends/digest`) et n'est pas exposé par le MCP, la conversation rédige elle-même à partir
de la liste.

## Garde-fous et erreurs

- **Garde-fou optimiste.** L'agent dit ce qu'il croit voir (`expectedCategoryName`,
  `expectedAmount`) ; si la base dit autre chose, rien n'est écrit et la réponse l'explique. C'est
  ce qui protège d'un lot rejoué ou d'une ligne confondue. Pour une ligne non classée,
  `expectedCategoryName` est la chaîne vide.
- **Refus en réponse, pas en exception.** Un refus est une réponse MCP `isError: true` avec un
  message lisible ; les refus des services (404, 400) sont rendus de la même façon, préfixés de
  « Refusé par le serveur ». Seule une vraie panne (5xx) remonte en erreur de transport.
- **Journal.** Chaque écriture est journalisée côté serveur (`Logger` Nest, niveau `log`) :
  outil, utilisateur, identifiants, classement avant et après. Ni montant ni libellé.

## Exécuter un document de reclassement

Un document de reclassement est une liste fermée de transactions avec, pour chacune, sa cible et
la raison. Procédure pour l'agent qui l'exécute :

1. `get_categories` : vérifier que chaque cible du document existe chez l'utilisateur, de
   préférence par sa clé de catalogue. Une cible absente arrête tout.
2. `get_transactions` sur la catégorie de départ (`categoryName` ou `categoryId`, en paginant) :
   compter, comparer les identifiants à ceux du document. Tout écart arrête.
3. Par cible, `set_transactions_category` par lots de 50 au plus, cible par `categoryKey`, avec
   `expectedCategoryName` (ou `expectedCategoryKey`) égal à la catégorie de départ. Les lignes
   marquées « à vérifier » ne sont pas envoyées.
4. Relire la catégorie de départ : il ne doit rester que les lignes « à vérifier ».
5. Rendre compte : par cible, lignes mises à jour, inchangées et refusées, avec la raison de
   chaque refus. Garder les réponses : leur `before` est ce qui permet d'annuler.

## Tester en local

Le connecteur « Bankin » de claude.ai pointe sur la production : ne pas l'utiliser pour tester une
écriture. En local, avec la stack démarrée et un jeton Supabase local :

```sh
# 3443 au lieu de 3000 si la stack sert en TLS
curl -s http://localhost:3000/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

puis un `tools/call` de `set_transaction_category` sur une ligne quelconque, et son retour
arrière avec le même outil et le `before` de la réponse.

## Limites connues

- **Pas de portée d'écriture.** Le garde accepte tout jeton Supabase valide : un agent connecté
  pour lire peut, de fait, écrire. Un scope OAuth ou un en-tête réservé aux écritures serait
  propre ; non fait.
- **Pas de création** de sous-catégorie, de personne, d'étiquette ni de famille par le MCP.
- **Pas d'annulation groupée** ni de journal persistant : l'annulation se fait ligne à ligne avec
  le `before` rendu.
