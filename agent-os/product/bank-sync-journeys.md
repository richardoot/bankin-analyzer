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

## Journey 3 — an account is the user's, and each source has its own name for it

The sync knows more about an account than the export ever did. `/accounts/{uid}/details`
returns an IBAN, an ISO 20022 `cash_account_type` and the bank's own product name;
a Bankin export has one column, `Compte`, holding whatever the user typed.

The conclusion is not that one source should win. It is that **`Account` belongs
to the user** — their name, their `type`, their `divisor` — and each source keeps
its own way of pointing at it:

|                | how the source names it          | where it is recorded                  |
| -------------- | -------------------------------- | ------------------------------------- |
| Bankin CSV     | the label in the `Compte` column | missing — the name _is_ the key today |
| Enable Banking | IBAN, identification hashes      | `BankAccountLink`                     |

The bank side already exists. The CSV side does not, and its absence is a defect
that predates the sync entirely: `upsertByName` resolves an import by the account
name, and renaming an account is offered in the settings. Rename `Perso Bourso`
to `Bourso`, and the next export — whose column still says `Perso Bourso` —
silently creates a second account, STANDARD with divisor 1, splitting the
transactions of one real account across two rows with different arithmetic.

So `Account` needs an alias table on the CSV side, holding every label an export
has ever used for it. The import then resolves label → alias → account, a rename
changes nothing, and a label nobody has seen becomes a question rather than a
new account.

### What we can propose, and how sure we are

Three signals, in decreasing order of trust:

1. **IBAN or identification hash** — certain, but only once stored. An export
   carries neither, so this can never match a _pre-existing_ CSV account; it only
   keeps a bank account recognisable across sessions and re-authorizations.
2. **Transaction evidence** — the only bridge between an export account and a
   bank account. Measured at 100 % on the three current accounts, homonyms
   included. It needs history to reason from, and says nothing on a fresh ledger.
3. **`cash_account_type`** — not a match at all, but it decides whether a bank
   account _should_ be matched. `CARD` accounts have no counterpart in the ledger:
   they are the same money as the account they settle onto.

Name similarity is not on the list. `CAV - BOURSOBANK` and `Perso Bourso` share
nothing, and Boursorama returns two accounts with identical names.

### The moments the user is asked

**An import brings an account label nobody has seen.** Today it is conjured.
It should be shown in the preview, before anything is written, with three
answers: it is this existing account (proposing the closest by transaction
evidence), it is new (name it, joint?, excluded from stats?), or skip its rows
for now.

**A bank is connected and its accounts are listed.** Each one shows what
`/details` gave — name, product, IBAN — and asks the same three questions, with
the defaults set by evidence and type: a `CACC` matched with confidence is
pre-selected on the account it matched; a `CACC` matched by nothing proposes
creation; a `CARD` whose transactions duplicate an enabled account proposes
"ignore", and says why.

**A previously answered question is never asked again.** The answer becomes an
alias or a link, and both survive renames, re-authorizations and new exports.

### What the user must never be asked

Whether two accounts are the same, in the abstract. The question is always
concrete — "these 560 transactions matched rows filed under Perso Bourso; is
this that account?" — because that is the evidence they can actually judge.

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

### C. Give an account its aliases, and stop inventing accounts

`Account` gains an alias table on the CSV side: every label an export has used
for it. The import resolves label → alias → account instead of name → account.

This closes a defect that has nothing to do with the sync — renaming an account
today makes the next import create a duplicate — and it is what lets the user
name an account whatever they like while both sources keep finding it.

An unknown label is then a question in the import preview, not a conjured
`STANDARD` / `divisor: 1` account.

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
