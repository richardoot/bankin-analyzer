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

| Outil                   | Rôle                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_transactions`      | Transactions paginées (50 par défaut, 100 au plus). Filtres : `type`, `startDate`, `endDate`, `categoryId`, `categoryName`, `subcategoryId`, `search`, `account`. Chaque ligne porte `id`, `accountId`, `categoryId`, `subcategoryId`. |
| `get_transaction`       | Une transaction par `id` : classement complet, note, tags, demandes de remboursement qui la portent, règlements qu'elle paie (pour un revenu). À appeler avant et après une écriture.                                                  |
| `get_categories`        | Toutes les catégories, chacune avec ses sous-catégories (`id`, `name`, `icon`).                                                                                                                                                        |
| `get_persons`           | Les personnes (`id`, `name`) à qui une dépense peut être réclamée.                                                                                                                                                                     |
| `get_reimbursements`    | Demandes de remboursement, par `transactionId`, par `personId`, et filtrées par `status` (`PENDING`, `PARTIAL`, `COMPLETED`).                                                                                                          |
| `get_budget_statistics` | Moyennes de dépenses et revenus par catégorie sur une période, remboursements déduits.                                                                                                                                                 |
| `get_dashboard_summary` | Dépenses et revenus par mois et par catégorie.                                                                                                                                                                                         |

`categoryName` dans `get_transactions` suit la même règle de nom que les écritures (ci-dessous) ;
quand le filtre `type` est donné, seules les catégories de ce type sont candidates, ce qui
départage un nom porté par une catégorie de dépense et une de revenu.

## Outils d'écriture

Trois écritures, toutes réversibles. Il n'y a **aucun outil de suppression** : supprimer une
transaction, une demande ou un règlement reste dans l'application.

### Désigner une cible

Une catégorie se désigne par `categoryId` **ou** par `categoryName`, une sous-catégorie par
`subcategoryId` **ou** par `subcategoryName`. Les noms se comparent sans casse, sans accents et
sans espaces superflus. L'outil ne devine jamais ; il refuse :

- ni identifiant ni nom de catégorie, ou l'identifiant et le nom donnés ensemble ;
- une catégorie inconnue de l'utilisateur, ou un nom porté par plusieurs catégories (le nom n'est
  unique que par type) : il faut alors passer `categoryId`, que le message d'erreur liste ;
- une sous-catégorie inconnue, ou qui n'appartient pas à la catégorie cible. Une sous-catégorie
  par nom est cherchée dans la catégorie cible seulement.

Sans sous-catégorie, la transaction est classée dans la catégorie seule et perd l'ancienne
sous-catégorie. Une catégorie ou une sous-catégorie ne se crée pas par le MCP.

### `set_transaction_category`

`transactionId`, la cible, et `expectedCategoryName` (optionnel, recommandé).

Déroulé : lecture de la transaction, garde-fou, refus si la cible n'est pas du type de la
transaction (une dépense ne va jamais dans une catégorie de revenu), écriture par
`TransactionsService.update`. La réponse donne `status` (`updated` ou `unchanged`), la
transaction, et le classement `before` et `after` avec noms et identifiants. Une cible identique
au classement actuel n'écrit rien et répond `unchanged`.

**Annuler** : rappeler l'outil avec `categoryId` et `subcategoryId` de `before`.

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

1. `get_categories` : vérifier que chaque cible du document existe chez l'utilisateur, par nom
   ou par identifiant. Une cible absente arrête tout.
2. `get_transactions` sur la catégorie de départ (`categoryName` ou `categoryId`, en paginant) :
   compter, comparer les identifiants à ceux du document. Tout écart arrête.
3. Par cible, `set_transactions_category` par lots de 50 au plus, avec `expectedCategoryName`
   égal à la catégorie de départ. Les lignes marquées « à vérifier » ne sont pas envoyées.
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
- **Pas de déclassement.** `categoryId: null` n'est pas accepté par le service sur `main` ; le
  cadre des catégories l'apportera.
- **Pas de création** de sous-catégorie ni de personne par le MCP.
- **Pas d'annulation groupée** ni de journal persistant : l'annulation se fait ligne à ligne avec
  le `before` rendu.
