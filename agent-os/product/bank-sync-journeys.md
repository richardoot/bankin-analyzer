# Bank sync — user journeys and what they demand

Phases 0 to 6 proved the sync can read three banks, recognise what the ledger
already holds, and write without destroying anything. What they did not settle
is how a person arrives at it. Three journeys lead there, and each breaks in a
different place.

## The one thing all three need

**One real bank account must be one `Account` row that both sources resolve
to.**

The two sources name it differently and neither name is a key:

|                | how it names an account                          | why it cannot be the key                         |
| -------------- | ------------------------------------------------ | ------------------------------------------------ |
| Bankin CSV     | the user's own label — `Perso Bourso`, `CJ Fixe` | no bank has ever heard it                        |
| Enable Banking | the bank's label — `M  BOILLEY R OU MLLE TORR`   | Boursorama returns two card accounts sharing one |

`Account` is unique on `(userId, name)` and `upsertByName` resolves by name
alone, silently creating a `STANDARD` account with `divisor: 1` for anything
unknown. That is the fault line under every journey below: it is how one real
account becomes two rows, one of them with the wrong divisor.

`BankAccountLink` already holds the bank side (`iban`,
`identificationHash`, `accountId`). Nothing yet holds the CSV side, and nothing
asks the question at import time.

---

## Journey 1 — CSV first, then sync

The current user's case, and the one measured end to end.

**What works.** The ledger is full, so the mapping is inferable from evidence:
three current accounts resolved at 100 %, including the two homonyms that
landed on different accounts. 1 531 rows claimed, 330 inserted, nothing lost.

**What breaks.** The user keeps exporting from Bankin — that is the whole
premise of coexistence — and the CSV import does not know the synced rows
exist. It deduplicates on `hash`, which includes the description, and the two
sources word a transaction differently:

```
sync : "CARTE 31/08/24 PROTIMING         CB*7962"
CSV  : "CB Protiming"
→ different hash → inserted again
```

Verified on three real rows, wrong on all three. **Today, re-importing an
export covering a synced period duplicates it.**

**What it demands:** step A.

---

## Journey 2 — sync first, then CSV

A new user, or an account added later.

**What breaks first.** The ledger has nothing to infer from, so
`proposeMapping` proposes nothing (it wants five agreeing matches) and the
ingestion refuses to run. Correct, and a dead end: there is no way to _create_
an account from a bank account.

**What breaks next.** Suppose the user creates `Perso Bourso` by hand and maps
it. Later they import a Bankin export whose column says `Perso Bourso` — fine.
But if they name it anything else, or if the sync created the account under the
bank's label, `upsertByName` creates a **second** account and every transaction
lands twice, split across two rows that look like two accounts.

**What it demands:** steps B and C.

---

## Journey 3 — setting the accounts up

Not a phase of its own so much as the moment both journeys pass through: the
user is shown what the bank offers and decides what each thing is.

Three answers must be available for every bank account:

1. **it is this existing account** — proposed from evidence where there is
   history, chosen from a list where there is not;
2. **it is new** — create an `Account`, and ask the two questions the CSV
   import currently guesses: is it joint (`divisor`), is it excluded from
   stats;
3. **ignore it** — the right answer for a card account whose purchases are
   already reported by the current account it settles onto. 597 of them in one
   Boursorama session.

The third is the default (`isIngested` is false) and the interface must never
offer "enable everything".

---

## Steps, in order of risk

### A. Teach the CSV import about synced rows

Closes the only path that corrupts data today.

The import deduplicates on `hash`. It must also reconcile against rows carrying
an `externalId`, with the phase 3 matcher — same account, same amount, date
within three days, label as tie-breaker.

On a match, the CSV row should **enrich rather than skip**: the synced row
holds the bank's reference but a raw label and often no category; the CSV row
holds the user's category. Filling the category of an unfiled synced row is the
mirror of what phase 4 already does in the other direction, and it loses
nothing either way.

### B. Let a bank account become an account here

Unblocks journey 2. `ingest-bank-run` gains the ability to create an `Account`
from a `BankAccountLink`, with the type and divisor asked rather than assumed.

### C. Make the CSV import stop inventing accounts

`upsertByName` silently creating `STANDARD` / `divisor: 1` is what turns one
real account into two rows with different arithmetic. An unknown account name
in an import should be surfaced — mapped to an existing account or created
deliberately — not conjured.

This changes existing import behaviour, so it needs the same care as the rest:
a preview that says what will be created before anything is.

### D. Traceability and undo

`Transaction.importHistoryId` lets a CSV import be found and reversed. A sync
ingestion has no equivalent: `BankSyncRun` exists but no transaction points at
it. Add the reference, then the script that undoes a run — unclaim the rows it
claimed, delete the rows it inserted, touch nothing else.

### E. A date floor on ingestion

The API reaches further back than the CSV ever did — four months further, in
the measured case. Those rows are enrichment, but they change totals for
periods the user already considered settled. Ingestion should accept "nothing
before this date", and the default should be stated rather than silent.

---

## What the product should recommend

Journey 1 is strictly easier than journey 2: the mapping is inferable only when
there is history to infer from. Onboarding should say so — import an export
first, then connect the bank — rather than pretend the two orders are
equivalent.
