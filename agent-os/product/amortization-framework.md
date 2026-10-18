# Cadre des achats lissés et de l'exceptionnel

Rédigé le 2026-10-18. Aucune branche ouverte. Fait suite au [cadre des catégories](category-framework.md), dont il reprend la règle : chaque entité répond à une seule question sur une transaction.

## Le problème

Richard achète un iPhone 17 Pro, environ 1 300 €, et veut le compter sur au moins deux ans. Sans traitement, le mois d'achat explose et la moyenne d'un plan de six mois porte 217 €/mois de trop pendant six mois, puis plus rien. Le seul outil disponible aujourd'hui, le tag exceptionnel, fait disparaître l'achat des moyennes de vie courante pour toujours.

| Traitement          | Effet sur le budget                                         | Ce que ça dit du train de vie                  |
| ------------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| Aucun               | +1 300 € sur un mois, +217 €/mois de moyenne pendant 6 mois | Faux : un pic, puis l'oubli                    |
| Tag exceptionnel    | 0 €, pour toujours                                          | Faux : un téléphone revient tous les 2 à 3 ans |
| Lissage sur 24 mois | 54 €/mois pendant 24 mois                                   | Juste                                          |

Le tag exceptionnel cache la dépense au lieu de l'étaler. Si chaque gros achat d'équipement passe en exceptionnel, la vie courante sous-estime le coût de vie de plusieurs dizaines d'euros par mois, et les plans proposés à partir de ces moyennes en héritent.

## Ce que fait le tag exceptionnel aujourd'hui

C'est un drapeau sur un tag (`Tag.isExceptional`), jamais une catégorie : le cadre des catégories l'interdit. Une transaction est exceptionnelle si elle porte au moins un tag exceptionnel.

- En mode « Vie courante » (défaut de la page Budget), elle sort des moyennes, de la matrice mensuelle et des montants proposés à la création d'un plan (CTE `exceptional_tx` dans `budgets.service.ts` et `dashboard.service.ts`).
- En mode « Réel », elle compte au mois de sa date.
- Le tag peut porter une fenêtre (`eventStartDate`, `eventEndDate`) : la vie courante est suspendue, ces jours sortent du dénominateur des moyennes et la base de référence des sous-catégories variables est déduite du surcoût (`common/exceptional-periods.ts`). Sans fenêtre, l'événement s'ajoute à la vie courante.
- Le tag peut porter une enveloppe (`budgetAmount`), imputée sur la réserve projets du plan (`(revenu de référence − épargne − enveloppes) × mois`).

## Décisions

Une nouvelle entité, le lissage, à côté du tag exceptionnel.

| Entité           | Question                                                 | Qui définit                  |
| ---------------- | -------------------------------------------------------- | ---------------------------- |
| Tag exceptionnel | Vie courante ou épisode ?                                | Utilisateur, par transaction |
| Lissage          | Sur combien de mois ce coût de la vie courante s'étale ? | Utilisateur, par transaction |

Trois cas, et un test pour les départager : **est-ce que ça reviendra sous une forme comparable dans les deux à trois ans ?**

1. **Épisode** : voyage, mariage, déménagement, compétition, fête. Ne reviendra pas. **Tag exceptionnel**, financé par la réserve projets. Avec fenêtre si la vie courante s'arrête, sans fenêtre si l'épisode s'y ajoute.
2. **Bien durable renouvelé** : téléphone, ordinateur, électroménager, vélo, mobilier, équipement de sport. Reviendra. **Lissage** sur la durée d'usage, dans l'enveloppe de sa catégorie, en vie courante.
3. **Imprévu subi** : réparation auto, dentiste, amende, remplacement d'une chaudière. Reviendra, sous une autre forme : les imprévus font partie du coût de la vie. **Reste en vie courante**, lissé sur une durée courte (6 à 12 mois) si le montant déforme le plan. Jamais exceptionnel.

Règles :

- Une transaction est exceptionnelle ou lissée, jamais les deux. Le service refuse de lisser une transaction qui porte un tag exceptionnel et de poser un tag exceptionnel sur une transaction lissée, avec l'explication.
- Le lissage commence au mois de la date de la transaction. Pas d'antidatage ni de départ décalé.
- Un achat déjà étalé par son mode de paiement (crédit, paiement en trois ou quatre fois) n'est pas lissé : les échéances font déjà le travail.
- Le lissage ne touche que les dépenses. Un revenu exceptionnel (prime, vente) n'est pas lissé dans ce cadre.
- Comme pour l'exceptionnel, le lissage est un attribut de la transaction, jamais une catégorie ni une sous-catégorie. Aucune catégorie « Gros achats ».
- La sous-catégorie et ses attributs (nature, rythme) ne changent pas. Une tranche se lit comme un engagement tant que le lissage court : elle tombe chaque mois sans nouvelle décision.
- Durées suggérées : téléphone et ordinateur 24 à 36 mois, électroménager et mobilier 36 à 60 mois, imprévu 6 à 12 mois. Bornes acceptées : 2 à 60 mois.

## Modèle

Une colonne nullable `amortization_months SMALLINT` sur `transactions`, contrainte `CHECK (amortization_months BETWEEN 2 AND 60)`. Pas de nouvelle table : une transaction n'a qu'un lissage, son départ est sa date, et l'historique des changements n'apporte rien au calcul. Une table deviendra utile le jour où l'on voudra lisser un groupe de transactions (un achat payé en plusieurs fois avec des frais) ou une valeur résiduelle ; ce n'est pas dans le premier périmètre.

## Calcul

Tout se fait à la lecture, rien n'est matérialisé.

- Dans les requêtes des statistiques de budget et du dashboard, une CTE `amortized_slices` remplace chaque transaction lissée par `generate_series` de N mois à partir de `date_trunc('month', t.date)`, chaque tranche valant montant net / N, la dernière absorbant l'écart d'arrondi.
- Le montant lissé est le **net** du registre de remboursements, déjà calculé dans ces requêtes (`reimbursement_payments`). Un remboursement reçu plus tard se répercute sur toutes les tranches, passées comprises, puisque rien n'est figé.
- Seules les tranches qui tombent dans la fenêtre demandée comptent. Un achat de juin lissé sur 24 mois pèse 54 € dans un plan juillet-décembre, sans débordement.
- Les tranches futures alimentent la lecture « engagé » des plans à venir, au même titre qu'un abonnement.
- Les moyennes de vie courante, la matrice mensuelle, la proposition de montants d'un nouveau plan, la structure des dépenses (nature et rythme) lisent les tranches. Les analyses par tag lisent la transaction brute.

Deux lectures, pas de troisième :

- **Réel** : la trésorerie, transaction à sa date, montant entier. Le lissage n'y change rien.
- **Vie courante** : hors épisodes exceptionnels, achats lissés en tranches.

Ce qui ne bouge pas : la liste des transactions, les soldes, les comptes, les récurrences, le registre de remboursements. L'iPhone reste une ligne de 1 300 € avec un badge « lissé sur 24 mois ».

Invariants à tester :

- La somme des tranches d'une transaction égale son net, au centime.
- Le mode Réel est identique avant et après la fonctionnalité (golden masters du budget et du dashboard).
- Sur une fenêtre qui couvre tout le lissage, la vie courante d'une sous-catégorie égale son réel moins l'exceptionnel.

## Écrans

- **Transaction** : dans la modale, une action « Étaler sur… » avec 12, 24, 36 mois et une durée libre, la tranche mensuelle affichée en direct, et « Ne plus étaler ». Refus expliqué si la transaction porte un tag exceptionnel.
- **Liste des transactions** : badge « lissé · 24 mois » ; filtre « Lissées ».
- **Page Budget** : encart « Achats lissés en cours » sous les projets, une ligne par achat (libellé, tranche, mois restants, lien vers la transaction). Une cellule de la matrice qui contient des tranches le dit (« dont 54 € lissés ») et son lien « voir les transactions » montre aussi la transaction source, même si elle est datée d'un autre mois.
- **Avertissement de période** : en vie courante, un total sur une période ne correspond plus au cash ; le libellé du mode le dit.

## Lots

**Lot 0, modèle.** Migration de la colonne et de sa contrainte. DTO de transaction (`amortizationMonths`). `PATCH /transactions/:id` l'accepte, avec le refus croisé avec les tags exceptionnels, côté transactions et côté tags.

**Lot 1, calcul.** CTE `amortized_slices` dans `budgets.service.ts` et `dashboard.service.ts`, appliquée en vie courante seulement. Tests des invariants, golden masters inchangés en réel.

**Lot 2, écrans.** Action dans la modale, badge et filtre de la liste, encart de la page Budget, mention dans la matrice et liens vers la source.

**Lot 3, MCP et suggestion.** Outil `set_transaction_amortization`. La suggestion notée dans le cadre des catégories (« tag exceptionnel quand un montant dépasse largement l'habitude de sa sous-catégorie ») devient une question à deux réponses : « Épisode ou achat à lisser ? », avec une durée proposée selon la sous-catégorie (High-tech, Maison et déco, Sport et équipement de loisir, Entretien et réparation).

Chaque lot livre ses tests (`pnpm --filter backend test`, `pnpm --filter frontend test`) avant le suivant.

## Points à trancher

- Revente avant la fin du lissage : terminer le lissage au mois de la vente (le reste tombe d'un coup) ou laisser la vente en revenu face aux tranches restantes. Hors du premier périmètre.
- Achat de véhicule comptant : le lisser sur 60 mois, la borne, ou relever la borne pour ce cas.
- Relecture des tags exceptionnels existants : certains portent sans doute des achats d'équipement (le seed avait un tag « Gros achats ») qu'il faudrait passer en lissage. À chiffrer sur les données de Richard avant le lot 3.
