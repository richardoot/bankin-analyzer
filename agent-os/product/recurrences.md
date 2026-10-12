# Récurrences : les abonnements sans catégorie « Abonnements »

Branche : à créer depuis `main`. Richard commite lui-même. Pas de dépendance
en attente : le cadre des catégories est en production.

## Pourquoi

Le cadre range chaque abonnement à sa finalité : Netflix en Loisirs, Hevy avec le
sport, le forfait en Télécom. C'est juste, et c'est voulu, la catégorie
« Abonnements » a été écartée dès le premier jour parce qu'elle classait par mode
de paiement. Mais la question « combien je paie d'abonnements, lesquels, et
lequel arrêter » est une vraie question de finances personnelles, et le cadre ne
lui donne aucun écran.

La réponse n'est ni une catégorie, ni un tag :

- une catégorie classe par finalité, pas par mode de paiement ;
- un tag nomme un contexte qu'on décide, pas une propriété qui se lit dans les
  données ; et il se pose à la main, ligne par ligne, chaque mois, pour une
  information que la machine a sous les yeux.

Une récurrence est une propriété calculable : même marchand, même montant à peu
près, même intervalle. Elle se détecte, elle s'affiche, elle se corrige. C'est
une vue transversale, comme le plan du cadre l'avait posé.

## Ce que ça apporte, en deux temps

1. **La liste.** Un écran « Récurrences » : chaque charge récurrente avec son
   marchand, sa catégorie et sous-catégorie, son montant, sa périodicité, son
   équivalent mensuel, son dernier prélèvement, et le total mensuel en tête. Triable
   par catégorie, par montant, par ancienneté. C'est ce qui remplace la catégorie
   « Abonnements » : la même liste, sans toucher aux catégories.
2. **La preuve d'engagement.** Une récurrence détectée dit qu'une transaction est
   engagée, quelle que soit sa sous-catégorie. Simply Piano, en abonnement dans
   « Cours, coaching et formation » marquée variable, compte en « engagé » dans la
   lecture du dashboard et dans la base de référence des tags. Le rythme de la
   sous-catégorie devient le défaut, la récurrence constatée le corrige, et le
   point ouvert « rythme par transaction » se ferme sans nouvelle entité.

## Principes

- **Aucune entité nouvelle visible.** Pas de catégorie, pas de tag système. Une
  table technique pour mémoriser les refus et les confirmations du user, c'est
  tout.
- **Détection par marchand.** La clé de marchand du lot 5 (`merchantKey`, bruit
  bancaire retiré, mots triés) regroupe les lignes ; même règle pour la mémoire
  partagée et pour les récurrences, un seul endroit qui définit « le même
  marchand ».
- **Une récurrence se corrige, elle ne s'impose pas.** La détection propose ;
  l'utilisateur peut dire « ce n'est pas un abonnement » (un refus mémorisé par
  marchand) ou « c'en est un » pour une charge trop récente ou irrégulière
  (une confirmation mémorisée). Un refus ou une confirmation survit aux
  nouvelles transactions.
- **Transferts exclus.** Un virement d'épargne mensuel est récurrent, pas un
  abonnement : la détection ne regarde que les dépenses.
- **Les transactions ne portent rien.** Pas de colonne « récurrent » sur une
  transaction. Mais la lecture seule ne suffit pas : le dashboard et la base de
  référence des tags décident de l'engagé en SQL, ligne par ligne
  (`COALESCE(sc.rhythm, c.default_rhythm)`), et une détection faite en mémoire
  ne peut pas y entrer. Les récurrences sont donc **matérialisées** dans deux
  tables techniques, recalculées à chaque synchronisation, import ou
  reclassement, et par un script ; les calculs les joignent. Elles sont un
  cache de ce que les transactions disent, jamais une saisie, et se régénèrent
  à l'identique.

## Ce qui existe

- `backend/src/ai-suggestions/merchant-memory.ts` : `merchantKey(description)`,
  la réduction d'un libellé bancaire au marchand ; à réutiliser telle quelle.
- `backend/src/bank-sync/reconciliation.ts` : `normalizeLabel`, `humanizeLabel`
  pour afficher un libellé propre.
- `backend/src/dashboard/dashboard.service.ts` : la requête d'agrégation lit
  `COALESCE(sc.rhythm, c.default_rhythm)` et répartit en `committed` / `variable`
  dans `addToStructure` ; c'est là que la preuve d'engagement entre.
- `backend/src/tags/tags.service.ts`, vers la ligne 406 : la base de référence
  d'un tag exclut les lignes engagées par le même `COALESCE` ; même point d'entrée.
- `backend/src/bank-sync/bank-sync.service.ts` (`categorizeInserts`) et
  `backend/src/transactions/transactions.service.ts` (import) : les deux moments
  où des transactions arrivent, donc où le recalcul se déclenche ;
  `TransactionsService.update` et `bulkUpdate` pour le reclassement.
- `backend/src/mcp/mcp.controller.ts` : le patron d'un outil de lecture.
- Frontend : `SpendingStructureCard.vue` pour la ligne à ajouter,
  `useDashboardData.ts` pour le champ, `TransactionsPage.vue` pour le filtre par
  marchand vers lequel une ligne renvoie.

## Détection

Pure, dans `backend/src/recurrences/recurrence.detection.ts`, testée sans base.

Entrée : les dépenses de l'utilisateur sur les 15 derniers mois, `{ id, date,
amount, description, categoryId, subcategoryId }`, les transferts exclus.

1. Grouper par `merchantKey(description)`. Une clé vide n'est pas un marchand.
2. Dans un groupe, trier par date ; une **série** est une suite de lignes dont les
   montants sont dans une tolérance (5 % ou 1 €, le plus grand) autour de la
   médiane du groupe, et dont les intervalles sont réguliers : mensuel (28 à
   33 jours), hebdomadaire (6 à 8), trimestriel (85 à 95), annuel (355 à 375).
   Un montant qui sort de la tolérance ouvre une nouvelle série (changement de
   tarif) ; la plus récente est celle qu'on affiche.
3. Une série est une **récurrence** à partir de 3 occurrences (2 pour l'annuel),
   et tant que la dernière occurrence date de moins de deux périodes. Au-delà,
   elle est « arrêtée », gardée dans l'écran avec cette mention pendant six mois.
4. Sortie : `{ merchantKey, label (le libellé le plus fréquent, humanisé),
categoryId, subcategoryId, period, amount, monthlyEquivalent, occurrences,
firstDate, lastDate, nextExpected, status: 'active' | 'stopped' |
'candidate', transactionIds }`. Un « candidate » est une série de 2 (ou 1 pour
   l'annuel) qu'on montre à part, à confirmer.

Cas réels à tester, pris dans les données de Richard : Netflix (mensuel, hausse de
tarif), Free Mobile (mensuel, deux lignes de même montant le même mois à ne pas
compter deux fois), Apple (`CB Apple.com/bill` partagé entre iCloud, Apple Music
et Apple TV+ : plusieurs séries de montants différents sous une même clé, chacune
une récurrence), Hevy (annuel 3,49 € puis mensuel), une assurance auto
trimestrielle, le loyer (mensuel, catégorie engagée : apparaît, la récurrence
n'est pas réservée aux abonnements).

### Écarts constatés au lot 0

Les données réelles, relues le 2026-10-07, ont corrigé le plan sur six points ;
le code fait foi.

- **Fenêtres d'intervalle plus larges.** Un loyer viré à la main part entre le
  1er et le 7 ; un prélèvement du samedi tombe le lundi : les écarts mensuels
  réels vont de 27 à 36 jours. Mensuel 24 à 38, hebdomadaire 5 à 9, trimestriel
  80 à 100, annuel 358 à 372 (resserré : un abonnement annuel se renouvelle à
  sa date, un achat un an plus tard non). Une seule échéance manquante (écart jusqu'à deux
  périodes) ne coupe pas la série : Apple n'a pas de ligne en février 2026.
- **Regroupement des clés proches.** Le loyer s'écrit « Vir Sepa
  <bailleur> » ou « … Virement De <colocataire> Réf » : deux `merchantKey`. Les clés
  sont fusionnées par `isSameMerchant` (Jaccard ≥ 0,5), exportée de
  `merchant-memory.ts` pour que les deux usages partagent la définition.
- **Libellés partagés : PayPal autant qu'Apple.** Netflix et Hevy passent par
  « Prlv Sepa Paypal Europe S.a.r.l ». Le regroupement par montant les sépare.
- **Changement de tarif = chaînage.** Les montants sont regroupés en grappes
  (5 % ou 1 €) ; une série qui s'arrête quand une autre du même marchand et de
  même période commence, une période plus tard, est la même charge à un
  nouveau prix (Netflix 14,99 → 21,99 → 14,99, AMV 48,50 → 37,30). Une seule
  récurrence, affichée au dernier montant. Une décision prise sur un ancien
  montant s'applique toujours (elle est comparée à tous les montants de la
  chaîne).
- **Pas de candidate annuelle à une occurrence.** Une ligne seule n'a pas
  d'intervalle ; toute dépense ponctuelle serait candidate. Une annuelle
  devient récurrence à sa deuxième occurrence.
- **Cas réels différents de ceux annoncés.** Pas de Free Mobile dans les
  dépenses de Richard (le doublon du même mois est testé en synthèse) ; l'AMV
  est mensuelle (deux contrats prélevés le même jour, chacun révisé), pas
  trimestrielle (le trimestriel est testé en synthèse) ; Hevy via PayPal (deux
  lignes à cinq mois d'écart) n'est pas une récurrence, et c'est le bon
  résultat.

## Modèle

Trois tables techniques, dans le schéma `app`, une migration Prisma.

- `recurrences` : `id, userId, merchantKey, label, categoryId?, subcategoryId?,
period (WEEKLY | MONTHLY | QUARTERLY | YEARLY), amount, monthlyEquivalent,
occurrences, firstDate, lastDate, nextExpected, status (ACTIVE | STOPPED |
CANDIDATE), computedAt`. Le résultat de la détection, régénéré ; unique sur
  `(userId, merchantKey, amountBucket)` où `amountBucket` est le montant arrondi
  à l'euro, pour distinguer les séries d'un même marchand (les trois Apple).
- `recurrence_transactions` : `recurrenceId, transactionId`, unique sur le
  couple, index sur `transactionId`. Ce que les calculs joignent.
- `recurrence_decisions` : `userId, merchantKey, amountBucket?, decision
(CONFIRMED | DISMISSED), createdAt`, unique sur `(userId, merchantKey,
amountBucket)`. La seule saisie de l'utilisateur, jamais régénérée. Un
  DISMISSED retire la série de la liste et de la preuve d'engagement ; un
  CONFIRMED promeut une candidate et la garde active même irrégulière.

Le recalcul (`RecurrenceService.recompute(userId)`) relit les dépenses des 15
derniers mois, applique la détection pure, applique les décisions, puis remplace
les lignes de l'utilisateur dans `recurrences` et `recurrence_transactions` en
une transaction. Déclenché à la fin d'une synchronisation, d'un import, d'un
reclassement (unitaire ou groupé), et par `src/scripts/recompute-recurrences.ts`
(`--email`, `--dry-run`). Idempotent : deux recalculs sans nouvelle transaction
donnent les mêmes lignes.

## API

- `GET /recurrences` : la liste calculée, décisions appliquées, avec les totaux
  (`monthlyTotal`, par catégorie, par nature).
- `PUT /recurrences/decisions` avec `{ merchantKey, amountBucket?, decision }`,
  qui enregistre la décision et recalcule ; `DELETE /recurrences/decisions` avec
  les mêmes clés pour revenir à la détection.
- Un outil MCP de lecture `get_recurrences`, dans la foulée.

## Dashboard et calculs

- `dashboard.service.ts` et `tags.service.ts` : un `LEFT JOIN
app.recurrence_transactions rt ON rt.transaction_id = t.id` et un `JOIN
app.recurrences r ON r.id = rt.recurrence_id AND r.status IN ('ACTIVE')` ;
  le rythme lu devient `CASE WHEN r.id IS NOT NULL THEN 'COMMITTED' ELSE
COALESCE(sc.rhythm, c.default_rhythm) END`. Une transaction d'une récurrence
  active est **engagée** quel que soit le rythme de sa sous-catégorie ; une
  DISMISSED n'est pas dans la table ; le rythme de la sous-catégorie reste le
  défaut pour tout le reste. Même fragment dans les deux services, dans un
  module partagé comme `reimbursement-credit.sql.ts` l'a fait pour la
  déduction.
- La carte « Structure des dépenses » gagne une ligne « dont abonnements et
  charges récurrentes : X € / mois », avec un lien vers l'écran.

## Frontend

- Page `/recurrences`, dans la navigation à côté du budget : total mensuel en
  tête, liste groupée par catégorie, chaque ligne avec marchand, montant, période,
  dernier prélèvement, et deux actions, « Ce n'est pas un abonnement » et, sur
  les candidates, « Confirmer ». Clic sur une ligne : les transactions de la
  série, sur la page Transactions filtrée.
- Les charges « arrêtées » dans une section repliée.

## Lots

0. Détection pure (`recurrence.detection.ts`) et ses tests, sur les cas réels
   ci-dessus rejoués en fixtures.
1. Modèle et migration, `RecurrenceService.recompute`, ses déclencheurs
   (synchronisation, import, reclassement), le script, l'API de lecture et de
   décision, l'outil MCP `get_recurrences`. E2e : un compte avec trois mois de
   Netflix voit sa récurrence après recalcul ; un DISMISSED la retire ; un
   second recalcul ne change rien.
2. Preuve d'engagement dans le dashboard et la base des tags, par le fragment
   SQL partagé, avec les tests qui montrent Simply Piano compté en engagé et la
   base d'un tag qui ne déduit plus un abonnement.
3. Page, carte, filtre par marchand.

Chaque lot livre ses tests avant le suivant.

## Vérification

- `pnpm lint`, `pnpm typecheck`, `pnpm test` dans `backend/` et `frontend/`.
- En local sur la prod restaurée (`scripts/docker-start.sh --prod`) :
  `pnpm ts-node src/scripts/recompute-recurrences.ts --email richardboilley@gmail.com --dry-run`
  doit lister au moins Netflix, Free Mobile, les trois séries Apple, le loyer, et
  ne rien lister pour un marchand vu une fois. Puis l'écran, puis la carte du
  dashboard dont le total « engagé » doit augmenter du montant des récurrences
  tombées dans des sous-catégories variables.
- En prod après fusion : la migration passe au déploiement ; un premier recalcul
  par le script pour les deux comptes, les suivants viennent avec la
  synchronisation nocturne.

## État au 2026-10-07

Lots 0 à 3 codés sur `feat/recurrences`, non commités. Écarts au plan :

- **STOPPED compte aussi comme preuve d'engagement** (`status IN ('ACTIVE',
'STOPPED')`) : un abonnement arrêté en juin était engagé chaque mois où il
  a couru ; ses mois passés ne doivent pas redevenir variables le jour où il
  s'arrête. Les candidates ne prouvent rien.
- **Recalcul après chaque synchronisation, même vide** : le temps qui passe
  fait passer une récurrence en « arrêtée ».
- **Filtre de la page Transactions par série**, pas par marchand :
  `?recurrence=<amountBucket>:<merchantKey>`, clé stable d'un recalcul à
  l'autre (l'id de la ligne, lui, change).
- Champ `recurring` dans `SpendingStructureDto` : la part de l'engagé faite
  de récurrences, sur la période ; la carte l'affiche par mois.

### Un rythme ne suffit pas : achats d'habitude (2026-10-08)

Le premier dry-run en lecture seule sur les dépenses de prod de Richard
(1 242 lignes, 15 mois) trouvait 34 récurrences, dont des achats d'habitude à
prix stable : laverie, péages, supermarchés, billets SNCF, un café. Le
diagnostic série par série a montré deux signes qui trahissent une habitude,
devenus deux règles (`isCredible`) :

- **Peu de lignes hors série.** Un abonnement est prélevé à son rythme et
  nulle part ailleurs ; une habitude a plus de lignes au même prix à côté de
  la série que dedans (19 passages de péage autour d'une série « mensuelle »
  de 4). Les lignes d'une autre vraie série au même prix (3 ou plus) ne
  comptent pas.
- **Échéances manquées limitées.** Aucune sous 4 écarts, puis une pour 10.
  Une échéance sautée est un prélèvement raté ; une suite d'échéances
  sautées n'est pas un rythme (un café tous les 42, 42 et 63 jours).

Écartées après examen : le jour de prélèvement stable (Fitness Park et Basic
Fit prélèvent tous les 28 jours, leur jour du mois dérive) et l'exclusion des
paiements par carte (Apple, Claude, le coaching sont payés par carte).

**Période « toutes les 4 semaines »** (`FOUR_WEEKLY`, 13 fois par an) : une
série mensuelle dont la moyenne des écarts est ≤ 29 jours sur au moins trois
écarts. Fitness Park : 54,17 €/mois au lieu de 50.

Dry-run après les règles : 23 récurrences, 14 actives, 901,23 €/mois.
Restent : loyer, EDF, coaching, Claude.ai puis Anthropic, Fitness Park et
Basic Fit (4 semaines), Orange fibre et mobiles, AMV ×2, PayPal ×3 (dont
Netflix), Apple mensuel et annuel, Bouygues, Matmut, tenue de compte. À
surveiller : une candidate Auchan The Corner (ne compte pas dans l'engagé),
deux arrêtées courtes « CB Amz » (4 lignes) et Carrefour City (3 lignes).

### Suivi des abonnements en cours et passés (2026-10-08)

La page `/recurrences` a deux onglets : **En cours** (actives et candidates,
avec depuis quand et le total payé) et **Terminés** (date de début et de fin,
durée, total payé, dernier tarif ; le plus récemment terminé en tête).

Pour que le passé tienne :

- **Tout l'historique est lu**, plus seulement 15 mois ; une charge arrêtée
  reste listée pour de bon (elle était gardée six mois). Ses mois restent
  engagés dans le dashboard.
- **`totalPaid`** sur chaque récurrence (colonne `total_paid`) : la somme de
  ses lignes, à tous ses tarifs.
- **Un passé désordonné ne tue plus une série** : une chaîne qui a plus
  d'échéances manquées qu'elle n'en a le droit est coupée à chacune, et
  chaque morceau est jugé seul (`splitAtMisses`).
- **Orthographes reliées par un pont** : une orthographe qui ressemble à
  l'orthographe principale de deux marchands les réunit s'ils partagent deux
  mots (« begon patrice » relie les virements de loyer signés par l'un ou
  l'autre ; « amazon » seul ne relie pas « amazon prime » et « amazon
  payments »).

Dry-run sur tout l'historique de Richard (depuis le 1er janvier 2025,
lecture seule) : 15 en cours (888 €/mois), 2 candidates, 19 terminés — dont
Basic Fit, l'ancien Fitness Park Bordeaux, ChatGPT puis Claude, Amnesty,
l'acompte d'impôt, Orange fibre, EDF. Le loyer : 22 échéances, 14 400 €.
Restent à écarter à la main : un « annuel » Auchan à 25,59 €, Poke Moon,
les intérêts débiteurs.

### Noms, rattachements à la main, marquage manuel (2026-10-08)

- **Marquer une dépense comme abonnement** (page Transactions, « ↻
  Abonnement ») avec la périodicité que l'utilisateur connaît : l'annuel
  payé une fois, que la détection ne peut pas voir. Enregistré comme une
  confirmation portant `period` (migration `20261008120000`).
- **Fin plus tôt** : une récurrence est terminée dès que l'écart depuis son
  dernier prélèvement dépasse la borne haute de sa fenêtre (9 / 38 / 100 /
  372 jours), au lieu de deux périodes.
- **Rattacher à la main** une dépense à une série qu'elle ne ressemble pas
  (`recurrence_links`, migration `20261008160000`) : Strava payé par virement
  à 46,99 € puis renouvelé par carte à 59,99 €, sous un libellé qui ne
  partage qu'un mot. Ni le libellé ni le prix ne pouvaient les réunir.
- **Nom de service** lu dans les libellés (`recurrence.naming.ts`) : préfixes
  bancaires, formes juridiques, pays et références retirés ; les mots que
  tous les libellés d'une série partagent, sinon les premiers du dernier
  (« CB Strava Ireland Li » et « Vir Corner Strava Qwertys » → Strava).
  L'utilisateur peut le remplacer ; son nom est porté par une confirmation.
- **Liste des transactions** : une ligne d'abonnement porte un liseré et un
  badge « <nom> · <rythme> » qui filtre sur la série ; une ligne rattachée à
  la main peut être détachée.

Une « entreprise » comme notion à part a été écartée pour l'instant : elle
ne levait qu'un des trois obstacles du cas Strava (libellé, prix, une seule
ligne par prix). Les rattachements et les noms en sont le point de départ si
le besoin d'un nom de marchand apparaît ailleurs (classement, affichage).

### Abonnements : une identité stable (2026-10-09)

Ce que l'utilisateur dit d'une série (suivie, écartée, nommée, périodicité,
paiements rattachés) était accroché à une clé floue, marchand + montant
arrondi, que la série elle-même peut dépasser quand son libellé ou son prix
change : la décision restait orpheline, sans que rien ne le montre. C'est
désormais une table `subscriptions` à l'utilisateur (migration
`20261009090000`, qui reprend `recurrence_decisions` et `recurrence_links`) :

- **un id stable**, référencé par la ligne de cache de sa série
  (`recurrences.subscription_id`, unique : une série par abonnement au plus)
  et par ses paiements rattachés (`subscription_links`) ;
- **les orthographes et les prix qu'il reconnaît** (`merchant_keys`,
  `amount_buckets`, vide = tous les prix), que chaque recalcul élargit à ce
  que sa série couvre : un nouveau libellé, un nouveau tarif, et
  l'abonnement suit au lieu de perdre sa série ;
- **l'état, le nom, la périodicité** comme champs séparés : nommer ne
  confirme plus par effet de bord ;
- **les orphelins visibles** : un abonnement suivi qu'aucune série ne
  retrouve est listé à part (« Suivis sans échéance retrouvée ») et peut
  être oublié.

Il naît au premier geste de l'utilisateur sur une série ; une série
seulement détectée reste du cache pur. La détection reçoit les abonnements
et rend, à côté des récurrences, ce que chacun a reconnu (`detect` →
`learned`), que le recalcul réécrit. Le harnais e2e sait s'arrêter avant une
migration (`stopBefore`) pour tester la reprise des données.

### Fraîcheur du cache et historiques de référence (2026-10-09)

- **Le cache sait quand il est périmé.** Des triggers sur `transactions`
  incrémentent une version par utilisateur à chaque changement qui compte
  pour la détection (date, montant, libellé, type, classement), quel que
  soit le chemin : API, cascade d'une catégorie ou d'un compte supprimé,
  annulation d'une synchro ou d'un import, script. Un pointage ou une note
  ne compte pas. Table `recurrence_states`, migration `20261009120000`.
- **Recalcul à la lecture** (`refreshRecurrences`) : la liste, le
  dashboard et l'analyse d'une étiquette reconstruisent le cache s'il est
  en retard sur la version, ou âgé d'un jour (le temps seul arrête une
  charge). Le recalcul lit la version avant le registre : un changement
  arrivé pendant le recalcul laisse le cache périmé au lieu d'être perdu.
  Plus de recalcul sur le chemin d'écriture ; la synchro de la nuit
  réchauffe le cache. Un utilisateur jamais calculé l'est à sa première
  lecture (plus de page vide après un déploiement).
- **Seuils regroupés** dans `RULES` (`recurrence.detection.ts`), chacun
  documenté par le cas réel qui l'a fixé.
- **Historiques de référence** : les dépenses des deux comptes, anonymisées
  (`src/scripts/export-recurrence-ledger.ts` : mots remplacés par des
  pseudonymes à clé aléatoire jetée, de même longueur, sans collision ;
  dates et montants conservés ; l'export refuse d'écrire si la détection
  lit le fichier autrement que le registre réel), rejouées par
  `recurrence.ledgers.spec.ts` contre une référence relue. Tout changement
  de règle montre son effet exact sur deux historiques réels.

## Points ouverts

- Les prélèvements dont le montant varie chaque mois (électricité au réel,
  téléphone avec hors forfait) : récurrents par l'intervalle, pas par le montant.
  Première version : tolérance stricte, donc souvent « arrêtés » puis repris. À
  élargir après observation.
- Faut-il montrer aussi les revenus récurrents (salaire, allocations) ? Hors
  périmètre, mais la détection s'y applique telle quelle.
- La détection par montant pour un libellé partagé (Apple) ne nomme pas le
  service ; une note par série, saisie par l'utilisateur, le permettrait.
