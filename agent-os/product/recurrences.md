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
- **Rien n'est écrit sur les transactions.** La récurrence est calculée à la
  lecture ; seuls les refus et confirmations sont stockés.

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

## Mémoire des décisions

Modèle Prisma `RecurrenceDecision { userId, merchantKey, amountBucket?, decision:
CONFIRMED | DISMISSED, createdAt }`, unique sur `(userId, merchantKey,
amountBucket)`. `amountBucket` arrondit le montant à l'euro pour distinguer les
séries d'un même marchand (les trois Apple). Un DISMISSED retire la série de la
liste et de la preuve d'engagement ; un CONFIRMED promeut un « candidate » et le
garde actif même irrégulier.

## API

- `GET /recurrences` : la liste calculée, décisions appliquées, avec les totaux
  (`monthlyTotal`, par catégorie, par nature).
- `PUT /recurrences/:merchantKey` avec `{ amountBucket?, decision }` ;
  `DELETE` pour revenir à la détection.
- Un outil MCP de lecture `get_recurrences`, dans la foulée.

## Dashboard et calculs

- `dashboard.service.ts` et `tags.service.ts` : une transaction dont l'id appartient
  à une récurrence active (ou confirmée) est **engagée** pour la structure des
  dépenses et pour la base de référence des tags, quel que soit le rythme de sa
  sous-catégorie. Une récurrence DISMISSED ne change rien. Le rythme de la
  sous-catégorie reste le défaut pour tout le reste.
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

0. Détection pure et ses tests, sur les cas réels ci-dessus rejoués en fixtures.
1. Modèle des décisions, service, API, outil MCP de lecture.
2. Preuve d'engagement dans le dashboard et la base des tags, avec les tests qui
   montrent Simply Piano compté en engagé.
3. Page et carte.

Chaque lot livre ses tests avant le suivant.

## Points ouverts

- Les prélèvements dont le montant varie chaque mois (électricité au réel,
  téléphone avec hors forfait) : récurrents par l'intervalle, pas par le montant.
  Première version : tolérance stricte, donc souvent « arrêtés » puis repris. À
  élargir après observation.
- Faut-il montrer aussi les revenus récurrents (salaire, allocations) ? Hors
  périmètre, mais la détection s'y applique telle quelle.
- La détection par montant pour un libellé partagé (Apple) ne nomme pas le
  service ; une note par série, saisie par l'utilisateur, le permettrait.
