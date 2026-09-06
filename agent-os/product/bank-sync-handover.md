# Bank sync — where this stands, and how to pick it up

Written at the end of the session that built it, for whoever continues.

Branch `feat/bank-sync-phase0-probe`, 36 commits, **nothing merged to `main`**
and nothing deployed. That is deliberate: the user's instruction is that none
of it reaches `main` until the whole thing has been exercised locally against
production data.

Read this first, then `bank-sync-journeys.md` (what a user does and where it
breaks) and `enable-banking-data-model.md` (what the API actually returns, as
measured rather than as documented).

---

## What the sync does today

Enable Banking, restricted production, one application whose credentials sit in
the environment. Three banks were exercised for real: Revolut, CIC, Boursorama.

The flow, end to end and reachable from `Réglages → Banques`:

1. choose a bank, get redirected to it, come back on `/bank-callback`
2. the accounts are discovered, described (`/accounts/{uid}/details`) and stored
3. for each one: say which account here it is, and whether to read it
4. press **Synchroniser**

Writing means: a transaction the ledger already has is **claimed** — it gains
the bank's `entry_reference` and keeps everything else, including its `source`
— and one it does not have is **inserted unfiled**. Nothing is ever deleted or
recreated.

### Facts that shaped the design, all measured

|                                             |                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `entry_reference` present                   | 100 % across 3 822 real transactions, three banks                                                            |
| `merchant_category_code`                    | absent everywhere — categorisation has only the label                                                        |
| History depth                               | 729 days at authorization, **90 days** on later fetches                                                      |
| Consent                                     | 180 days maximum, all three banks                                                                            |
| Boursorama double reporting                 | 597 purchases on both a card account and its current account, with a **different** `entry_reference` on each |
| Account mapping from evidence               | 100 % on the three current accounts, homonyms included                                                       |
| Re-importing a synced month, before the fix | 330 of 330 duplicated                                                                                        |
| Ambiguous matches, once accounts are mapped | 1 out of 1 954                                                                                               |

Two consequences worth keeping in mind:

- **`cash_account_type` (ISO 20022) is the only way to tell a card account from
  the current account it settles onto.** Transaction evidence cannot: the two
  genuinely share their transactions, and the evidence-based mapping confidently
  proposed `Carte Visa Ultim → Perso Bourso` at 100 %. Enabling a `CARD` account
  is refused by the API and disabled in the UI.
- **The deep history only exists around an authorization.** A routine sync sees
  90 days, so the CSV export keeps a permanent role as the archive.

---

## Code map

Pure logic, no Prisma, all unit-tested — this is where the thinking lives:

```
backend/src/bank-sync/
  reconciliation.ts     what is already known; global assignment, not per-row
  account-mapping.ts    which account here a bank account is, from the money
  categorisation.ts     how the user files this merchant, learned from history
  sync-policy.ts        whether the bank will answer (quota, consent, backoff)
  enable-banking.jwt.ts RS256 signing, shared by the app and the scripts
```

Wiring and I/O:

```
backend/src/bank-sync/enable-banking.client.ts   every call to the API
backend/src/bank-sync/bank-sync.service.ts       orchestration; the only writer
backend/src/bank-sync/bank-sync.controller.ts    /bank-sync/*
frontend/src/views/settings/BanksSettingsPage.vue
frontend/src/views/BankCallbackPage.vue
```

Scripts, which predate the module and still work — useful for measuring
without a browser:

```
backend/src/scripts/probe-enable-banking.ts     coverage, consent, account types
backend/src/scripts/spike-enable-banking-fetch.ts   fetch to a JSON dump
backend/src/scripts/stage-bank-dump.ts          stage a dump, report reconciliation
backend/src/scripts/ingest-bank-run.ts          write a dump into the ledger
backend/src/scripts/categorise-synced.ts        file what the sync inserted
backend/src/scripts/bank-sync-status.ts         what the policy would decide
backend/src/scripts/undo-bank-sync-run.ts       undo a run: delete what it inserted, unlink what it claimed
```

Schema: `Transaction.source` / `externalId` / `bookingStatus`,
`BankConnection`, `BankAccountLink`, `BankSyncRun`, `BankStagedTransaction`,
`AccountAlias`.

---

## Two fixes that have nothing to do with the sync

Both were defects the sync merely exposed, and both are already in.

**Re-importing a CSV over a synced month duplicated it.** The import
deduplicates on a hash that includes the description, and the two sources word
a transaction differently. It now also reconciles against rows carrying an
`externalId`, and reports them in the existing duplicate-review flow.

**Renaming an account made the next import create a second one.**
`upsertByName` resolved by the account's name while the settings offer to
rename it — and the new row arrived `STANDARD` with divisor 1, so a joint
account was halved on one side only. `AccountAlias` now holds the labels an
export uses; the migration backfills one per account.

---

## Testing locally

### The automated suites

```bash
cd backend  && pnpm test:unit   # 794
cd backend  && pnpm test:e2e    # 14 files, real Postgres, migrations replayed
cd frontend && pnpm test        # 626
```

The e2e suite is **flaky under parallel load** — roughly one run in three fails
on a port race or an HTTP parse error, never on an assertion. This was verified
to predate the branch by running the same suite on `main` in a worktree. Re-run
before investigating.

The bank-sync e2e files worth knowing:

```
test/transaction-identity.e2e-spec.ts   the identity columns and their constraint
test/bank-sync-staging.e2e-spec.ts      staging, and the DATE that must not drift
test/bank-sync-ingestion.e2e-spec.ts    claiming without destroying user work
test/import-over-synced.e2e-spec.ts     the CSV must not duplicate synced rows
test/import-account-aliases.e2e-spec.ts renaming must not fork an account
test/bank-sync-api.e2e-spec.ts          the HTTP surface, and every refusal
test/undo-bank-sync-run.e2e-spec.ts     undoing a run, and the one row it must refuse to touch
```

### Running the stack on production data

```bash
./scripts/docker-start.sh --prod
```

Dumps production at that moment, restores it locally, replays the migrations
production has not seen — so it rehearses the deployment as much as it copies
data — and re-points each `app.users` row at its local GoTrue identity.
Whatever the bank sync had written is lost with the schema, which is the right
trade: those rows rebuild in minutes, a fresh dump does not.

`--demo` and `--none` also exist; `DATASET=` in `.env.docker` sets the default.
**`--demo` is currently broken** on `Unknown argument 'categoryId'` in
`seed.mjs`, a mismatch that predates this work.

Requires `backend/.env.production.local`. Never points anywhere but localhost —
the restore drops and recreates every object it touches, and the guard is the
reason it is a script.

### Running the stack with TLS

The bank sync needs it: Enable Banking only redirects to an `https://` URL, and
a page served over https may not call an http API. In `.env.docker`:

```
STACK_HTTPS=true
BACKEND_HTTPS=1
VITE_API_URL=https://localhost:3443
VITE_SUPABASE_URL=https://localhost:8443
FRONTEND_URL=http://localhost:5173,https://localhost:5174
```

Then `./scripts/docker-start.sh`. It generates the certificate if absent and
refuses to start when those lines contradict each other.

- frontend `https://localhost:5174` (nginx; `:5173` still serves http)
- API `https://localhost:3443` — with TLS on, the backend serves **only** this
- Supabase `https://localhost:8443` (Kong, already there)

**Visit both `https://localhost:5174` and `https://localhost:3443` once** and
accept the self-signed certificate. Skipping the API's is the most common
failure and looks like a blank screen.

### When the browser calls the wrong API

If the console shows requests to `http://localhost:3001` from an https page,
the bundle is stale — the URLs are compiled in at build time. `docker-start.sh`
now checks what nginx serves and prints the command to force a rebuild:

```bash
podman rmi -f localhost/bankin-analyzer_frontend:latest
./scripts/docker-start.sh
```

The browser reports this as a CORS failure. It is not: an https page may not
call an http API, and the request never reaches the server.

### Enable Banking, for a real authorization

`.env.docker` carries `ENABLE_BANKING_APP_ID` and `ENABLE_BANKING_KEY_FILE`
(host path to the `.pem`, mounted read-only into the container). The key is
downloadable exactly once and lives outside the repository.

Redirect URLs must be registered in the Control Panel. Registered so far:
`https://localhost:5174/bank-callback.html`. **The screen uses
`https://localhost:5174/bank-callback`, which still needs registering.**

Restricted production means every account must first be whitelisted from the
Control Panel — "Activate by linking accounts", once per bank. An authorization
for a bank that has not been whitelisted succeeds and returns **zero accounts**.

Quotas: most banks allow four background fetches a day, and consent lasts at
most 180 days. `sync-policy.ts` guards the button accordingly.

---

## What to do next

**1. Exercise the flow through the screen. — done, 2026-09-05.** CIC connected
for real through `Réglages → Banques`. The first attempt failed: the account
appeared but its "à lire" toggle was still off, so `sync()` refused with "No
account is enabled on this connection" — a 400 the frontend surfaced correctly,
easy to miss for a first-time user. Fixed by flipping the toggle; sync then
ran. The local database still carries 2 connections and 12 links of which 6
are stale — leftovers from the scripts, now visible on the screen.

Separately noticed, unrelated to this fix: `frontend/src/stores/auth.ts`
registers its own `visibilitychange` listener that calls
`supabase.auth.refreshSession()`, duplicating the refresh `autoRefreshToken:
true` already performs internally (confirmed on `@supabase/supabase-js
2.98.0`, which has its own visibility handling). Landing back on `/bank-callback`
after a bank redirect makes the tab visible again, so both fire together and
can contend for supabase-js's internal auth lock — the likely source of the
`AuthError: Session timeout` seen once in the console, unrelated to the 400.
Not yet fixed; worth removing the app-level listener next time this area is
touched.

**2. Make a sync reversible. — done, 2026-09-05.** `Transaction.syncRunId`
(migration `20260905090000_add_transaction_sync_run_id`) records which run
last wrote to a row — set on both the `matched` and `new` branches of
`ingest()`, in `bank-sync.service.ts` and its `ingest-bank-run.ts` script
twin. `backend/src/scripts/undo-bank-sync-run.ts` undoes a run: deletes what
it inserted (`source: BANK_API`), clears `externalId`/`bookingStatus`/
`syncRunId` on what it only claimed, and refuses to delete an inserted row
that has since gained a tag, a reimbursement, a settlement, or a payment —
reporting it instead of guessing. Dry-run by default, `--apply` to commit.
Covered by `test/undo-bank-sync-run.e2e-spec.ts` (6 cases: delete, unlink,
dry-run, the blocked-row refusal, run isolation, unknown run id).

Not done: nothing in the UI triggers this yet, and the two stray connections
noted in step 1 are exactly the kind of mistake this script now cleans up —
worth using it on them rather than editing the database by hand.

**3. Key connections on `psu_id_hash`. — done, 2026-09-05, differently than
planned.** `psu_id_hash` was measured against the real `POST /auth` before
committing to it — a direct probe, two calls, same `psu_id`, two different
banks — and it came back identical both times. It identifies the PSU to the
_application_, not to the bank; it cannot tell two of a user's connections
apart, so keying anything on it would have collapsed every bank a user has
into one. Abandoned for that reason, not implemented as written.

The actual bug — `completeAuthorization` finding a connection by `aspspName`,
read from `session.aspsp`, which is the bank's own echo and once, for real,
did not repeat what this application had asked `POST /auth` with — is fixed
by carrying the canonical name across the gap instead: `BankAuthorizationAttempt`
records it at `startAuthorization`, addressed by `state`, the one value
already threaded through the whole redirect. `bank_connections` gained
`@@unique([userId, aspspCountry, aspspName])` as the backstop.

Testing this surfaced a second, sibling bug: re-authorizing CIC produced one
connection (the fix above holds) but **two account links** for the same
current account, both carrying the same IBAN. `BankAccountLink` was found the
same wrong way — by `externalAccountId`, the bank's handle _within a session_,
refreshed on every authorization, where `iban` (or `identificationHash` for a
card account) is what actually survives between them. The schema already said
so in a comment; the lookup never read it. Fixed the same way — matched by the
durable identity first, `externalAccountId` only stored — with
`@@unique([connectionId, iban])` and `@@unique([connectionId,
identificationHash])` as backstops. Confirmed fixed against the real CIC
connection: reauthorized twice, one connection, one link, both times.

**4. Add a date floor to ingestion. — done, 2026-09-05.** `ingest` now refuses
to _insert_ a `new`-verdict row older than the earliest transaction the
target account already has — computed live from the ledger already loaded for
reconciliation, no extra query. An account with nothing yet gets no floor: a
first backfill has no settled period to protect, which is exactly where the
deep history the bank briefly offers is worth having. A `matched` claim is
never held back by this — it only adds a reference to a row that already
exists, so there is no total left for it to revise. `SyncOutcome` gained
`skippedTooOld`, reported in the sync toast alongside the existing
`skippedAmbiguous`.

Caught along the way, unplanned: the real CIC sync surfaced "F TENUE DE
COMPTE" a few days later than CIC's own app and Bankin show it. Enable Banking
sends three dates that mostly agree — 123 of 129 transactions measured, exact
match — but for a fee the bank books after the fact, `transaction_date`
("date d'opération") is the one CIC and Bankin display, and `booking_date`,
preferred until now on the strength of a card purchase, is not. Swapped the
priority in both `bank-sync.service.ts` and `spike-enable-banking-fetch.ts`;
the three already-wrong local rows were corrected by hand.

**5. The settings screen, reworked — done, 2026-09-06, not on the original
list.** "Comptes" and "Banques" were two tabs looking at the same accounts —
the bank tab only offered a bare dropdown of them, so managing one meant
visiting both. Merged into one "Comptes" tab: an account linked to a bank
shows its full card (name, type, divisor, exclusions) grouped under the
connection that reads it, with the bank's own controls (IBAN, "Lu"/"Ignoré",
warning) visible without expanding anything; an account no bank has ever
heard of shows the same card under "Comptes sans banque". A card account —
always ignored, since it repeats what the account it settles onto already
reports — is folded under "Comptes masqués" instead of shown inline. Each
bank's logo is shown next to its name (`GET /aspsps`'s `logo` field, public
and CORS-open — confirmed against the real API rather than trusted from the
description; `-/preview/`, not `-/resize/`, or a landscape and a portrait logo
both come back distorted, also measured against the real logos rather than
guessed). `BanksSettingsPage.vue` is gone; `AccountsSettingsPage.vue` absorbed
it, with `AccountCard.vue` and `BankAccountLink.vue` extracted so the same
card and the same bank-account row render in every grouping without
duplicating the template three times over.

This surfaced the gap the "correspond à" dropdown always had: changing it only
redirects the _next_ sync. A row an earlier, wrong mapping already inserted or
claimed stayed exactly where it was. `BankSyncService.reassignLink` (and its
dry-run twin, `previewLinkReassignment`) fixes that: an inserted row is
reconciled against the corrected account exactly as a sync would — claimed if
that account already had it via CSV, moved if not — and a CSV row claimed by
coincidence on the old account simply loses the reference. A row that has
since gained a tag, a reimbursement, a settlement or a payment is left alone
rather than merged away, the same refusal `undo-bank-sync-run.ts` makes. The
frontend calls the preview first and only asks — `ReassignAccountModal.vue`,
showing exactly what would move, merge, unlink or get left alone — when that
preview is not all zeros; the ordinary first-time mapping stays a single
click. New endpoints: `POST /bank-sync/links/:id/reassignment/preview` and
`POST /bank-sync/links/:id/reassignment`.

First real use of it deleted transactions. Clearing a link entirely — "—
aucun —" — treated an inserted row as if the sync should never have written
it, and deleted it outright when it carried no work. Wrong: the row is a real
transaction that really happened, not an artefact of the mistake; the mistake
was only the account it landed on. Fixed the same day it was found —
`ReassignmentOutcome.removed` is gone, that case now unlinks exactly like a
CSV row claimed by coincidence, keeping the row wherever it already sits. No
recovery was possible for what was already deleted while this was live: no
soft-delete on `Transaction`, and it was local data, so it was left to
resync rather than reconstructed by hand. If a repair script is ever wanted
for this class of mistake, the shape is already worked out in
`undo-bank-sync-run.ts`.

Second real use surfaced a second bug, same day: correcting a genuinely wrong
mapping (a deliberate two-way IBAN swap, to test the feature) left the
transactions stuck on the old, wrong accounts even though `BankAccountLink`
itself now pointed the right way. `planLinkReassignment` found "what a wrong
mapping wrote" by looking up `Transaction.externalId` on the old account —
but the first correction (or the fix for the deletion bug above, tested in
between) had already cleared that field via unlink, so the rows became
invisible to every later reassignment, including the one meant to actually
fix them. Fixed by recovering a lost `externalId` from a
`${date}|${amount}|${label}` signature against `BankStagedTransaction` (the
raw fetch cache, keyed by the same fields, never touched by unlink) whenever
a `BANK_API` row on the old account has no `externalId` of its own — the
recovered value is used both to reconcile the row correctly and to restore
it on the move. The user's own two swapped links (6 rows stuck on "CJ Fixe",
2 on "CJ Irregulier") were repaired by hand with a throwaway script exercising
the fixed `reassignLink` directly against the local database, then deleted —
not kept, since it hard-codes this one incident's account names and IBANs.

Third real use, same day: repeating the swap test end to end — sync onto the
wrong accounts, then correct — left the transactions stuck exactly as before,
even with the second fix live. This time `planLinkReassignment` never ran its
recovery at all: `BankAccountLink.accountId` had already been cleared to
`null` by an earlier correction (in this test, the same "clear to aucun then
pick the right one" sequence the previous fix's own test exercised), and the
function's very first check — `if (!oldAccountId ...) return empty` — read
"no old account" as "nothing was ever written here" and walked away before
looking. Wrong: `accountId` being null said the _link_ had been cleared, not
that the _transactions_ had moved — they were still sitting wherever the
original, wrong sync had put them. Fixed by no longer requiring a known
`oldAccountId` to search: the check now only short-circuits when old and new
are genuinely the same (including both null), and when the old account is
unknown, the search scopes to "any account other than the one this correction
targets" instead of one specific account — still narrow enough to avoid
touching a row that already landed correctly, since only an unclaimed
(`externalId: null`) `BANK_API` row can match. The e2e test added for the
second bug had been quietly working around exactly this — it reset the
link's `accountId` back by hand before the second correction, "because the
page's dropdown would find it cleared otherwise" — which was the bug wearing
a comment, not a passing test; it now drives the real flow with no help from
a value the link no longer carries. The same two links were repaired by hand
again, the same throwaway-script way, then the script was deleted again.

**`BANK_SYNC_MIN_INTERVAL_HOURS`, added the same day, not on the original
list.** Testing a fix means resyncing the same connection over and over, and
the real 8h gap between fetches — there to be polite to the bank in
production — makes that a wait rather than a test. Set to `0` in
`.env.docker` for local work; unset in production, where the default (8h)
still applies. The daily quota (3/day) is untouched either way, since that
one reflects what Enable Banking will actually refuse.

It shipped wired into `sync()` only, which is what runs the fetch — and
missed `viewConnection`, which computes the same decision independently to
tell the settings screen whether the "Synchroniser" button should even be
clickable. The button stayed disabled with "fetched less than 8h ago" no
matter the override, because nothing ever calls `sync()` on a disabled
button — the request the override was supposed to unblock never left the
browser. Caught by the user immediately ("les synchro sont bloqué à 8 heures
minimum"), missed by the existing test for this endpoint because it only
ever exercised a connection that had never synced before — `lastSyncAt` null
skips the interval check entirely regardless of the override, so the one
case that mattered was never in the fixture. Fixed by passing
`syncPolicyOptionsFromEnv()` to both call sites; the new e2e test sets
`lastSyncAt` to now specifically so the interval check has something to
override.

**Fourth real use: a genuine gap, not a bug — clearing to "aucun" does not
move anything.** The user's report ("les 8 transactions synchronisées
restent associées au mauvais compte 'CJ Fixe'") turned out to be the
designed behaviour of the deletion-bug fix, working exactly as built:
clearing a link only drops the bank's claim on a row, since a `Transaction`
always belongs to some account and nothing here decides which one it should
move to instead. Confirmed against the data before answering rather than
assumed. The actual fix for "I don't know the right account yet" is to
choose it directly in the dropdown — verified working, not merely asserted.

Three small additions came out of that conversation, same day:

- **`needsBankReview` filter** (`transaction-filters.ts`, `GET
/transactions?needsBankReview=true`): any `BANK_API` row with no
  `externalId` — exactly the set `planLinkReassignment`'s own orphan recovery
  already knows how to find, now exposed as a filter a person can use
  directly. A toggle on the Transactions page ("À réaffecter").
- **`GET /bank-sync/needs-review`**: the same rows, grouped by account and
  counted, so a card in the settings screen can say "8 à réaffecter" without
  anyone having to go looking. Threaded through `AccountCard` → `extra-badges`
  rather than tied to a `BankAccountLink`, because the whole point is that the
  link mapping these rows arrived under may since have been cleared — the
  account is the one thing that never stops being true.
- **A nudge in `ReassignAccountModal`**: choosing "— aucun —" now says, in
  the confirmation itself, which account the rows will actually stay on, and
  suggests picking the real one directly instead if it's already known.

**Multi-connexion guard, requested in the same conversation.** Nothing had
ever stopped two `BankAccountLink` rows — same bank or two different ones —
from pointing at the same local account, which is exactly the setup for a
false merge: reconciliation compares an incoming row against the _whole_
ledger of the target account, so two banks feeding one account raises the
odds of a coincidental amount-and-date match a great deal. `planLinkReassignment`
now refuses (`assertAccountFree`, shared with `updateLink`) to point a link
at an account another link already claims, whichever of the two write paths
is used.

The one thing this changes: **a two-way swap can no longer complete in two
calls.** Each side's target is the other link's current account, so both
direct moves are refused — checked, not assumed: an e2e test swaps two
accounts both ways and confirms the direct attempt fails in both directions.
Clearing one side to "aucun" first frees its target, and the remaining two
moves go through in order — three calls instead of two, the same shape the
hand-repair scripts earlier in this document already used without knowing
there'd be a reason to.

**Fifth real use, same day: the "à réaffecter" badge itself walked straight
into the one case its own search still missed.** The user cleared IBAN
`...707` to "aucun" (its 8 rows stayed on "CJ Fixe", exactly as designed),
then corrected it directly to "CJ Fixe" — the ordinary, single-step fix once
the right account is known. Nothing moved; the badge still read 8. The third
bug's fix had widened the orphan search from "the one old account" to "any
account except the one this correction targets" — a deliberate exclusion, to
stop a row freshly and correctly reconciled onto the new account from being
compared against itself in the same pass. It excluded exactly the case that
now mattered: when the account someone names _is_ where the wrong sync
already left the rows, which is the single most likely target for a person
who has just found out — via this very badge — which account they belong on.

Fixed properly this time: the exclusion is gone from the search itself —
`accountScope` no longer excludes the target account when the old one is
unknown, so a row already sitting where the correction points is found like
any other. What the exclusion had actually been protecting against — a row
compared to a ledger that includes itself — is now guarded directly, at the
one place it can happen: the ledger query for the new account excludes the
ids of the rows currently being reconciled, whichever account they happen to
already be on. A row can be _in_ the incoming batch or _in_ the ledger it's
checked against, never both. The e2e test added for the third bug covered
"corrected to a different account than it started on"; this one covers
"corrected to the account it was already sitting on" specifically, since
that's the one the exclusion silently broke. The user's real 10 rows (8 +
2, across both swapped links) were repaired by hand a third time, the same
throwaway-script way.

**`humanizeLabel`, requested the same day, not on the original list.** A
synced row's `description` had always been Enable Banking's raw
`remittance_information` — `CARTE 06/08/26 FITNESS PARK CB*7962`,
`AUCHAN SUP 832\MERIGNAC\ FR` — sitting next to CSV rows in the Bankin export's
own already-clean style, `CB Fitness Park`. `reconciliation.ts` already had
`normalizeLabel`, but that one reduces a label to an uppercase, accent-free
match key for comparison — never shown, and unsuited to being shown.
`humanizeLabel`, beside it, does the same reading of what a bank pads a label
with — the card-line date, the card number, SEPA/RUM references, a
card-present line's trailing `\CITY\ COUNTRY` — but keeps the words: `CARTE
DD/MM/YY` becomes Bankin's own literal `CB` marker rather than being dropped,
and everything else is Title Cased on whichever letter comes first in each
token, so `(FACTURE:` reads `(Facture:` and a bare code with no leading
letter, `46G2`, passes through rather than being guessed at. Verified against
Bankin's own fixture strings already in `reconciliation.spec.ts` — `CARTE
25/08/26 APPLE.COM/BILL CB*7962` produces exactly `CB Apple.com/bill`, the
same string the CSV side of that file already uses as a ledger fixture.

Applied once, at the one place a label is first read from Enable Banking's
response, in `ingest()` — not as a separate step, and not touching
`normalizeLabel`'s own input. That single point matters: `label` there is
written to _both_ `BankStagedTransaction.label` and, on insert,
`Transaction.description`, and the third bug's whole fix depends on an exact
string match between the two — orphan recovery keys on
`${date}|${amount}|${label}`. Humanizing in only one of the two places would
have broken that comparison for every row from that point on. Scoped to new
syncs only, on request — the transactions already in the database keep their
raw label; nothing here rewrites history.

**AI categorization, requested the same day — "Phase 6", named in the ingest
script's own comment back in phase 4, arrives here instead.** A synced row
had always landed unfiled: the bank states an amount and a counterparty,
never what a purchase was for, and `TransactionsService` already has the
answer for exactly that gap — `filingFromModel`, the opt-in path a CSV import
takes when it stops trusting the file's own categories, asks `AiSuggestionsService.categorizeTransactions`
to place each transaction among the categories the user already has,
inventing none. `ingest()` now does the same thing at the one place it
inserts a genuinely new row.

Wired in as its own step, `categorizeInserts`, run _before_ the write
transaction rather than inside it — a network call has no business holding
open the lock the reconciliation writes need, and the two were already
separable: which rows will actually be inserted (`new`, mapped, not older
than the account's own floor) is decided first, unconditionally; the model is
asked about exactly that set, once; the result is applied when the insert
itself happens. A user with no categories yet is never asked — the same
short-circuit `filingFromModel` uses, and the same reasoning: nothing exists
for the model to choose from, so the request would only spend a token to
learn what was already known. A batch the model can't reach — timeout,
malformed answer, anything `categorizeTransactions`'s own try/catch didn't
already absorb — leaves those rows unfiled rather than failing the sync:
visible, one click to fix, the same refusal every other path in this feature
makes when a wrong answer would be worse than none.

Not touched: `src/scripts/ingest-bank-run.ts`, the standalone dump-replay
script phase 4 shipped ("Phase 6 owes the categorisation" is its own
comment, sitting a few lines above the account mapping logic) — it
reimplements ingestion independently rather than calling `BankSyncService`,
so this session's fix lives only in the path the running application's own
sync button uses. Worth folding in if that script is still someone's way of
replaying a dump by hand; not done here since nothing in this conversation
asked for it.

**Sync history, requested the same day — the CSV import screen has one, the
user asked whether the sync deserved the same.** It already almost did:
`BankSyncRun` had existed since the very first phase, `Transaction.syncRunId`
since the reversibility work, and `undo-bank-sync-run.ts` — delete what a
run inserted, unlink what it only claimed, refuse a row that has gained work
since — had been sitting as a script only, proven by its own e2e spec but
never reachable except by hand. The gap was UI and an HTTP wrapper, not
logic; this filled exactly that gap rather than rebuilding what the script
already got right.

`BankSyncService.listRuns` counts each run from what still points back at
it — `Transaction.syncRunId`, grouped by `source` to tell "inserted" from
"claimed" apart, the same reasoning `needsReview` already uses for a
different question. That count alone can't tell "undone" from "never wrote
anything" apart, though — both end at zero and zero — so `BankSyncRun` grew
one column, `undoneAt`, set the moment an undo actually runs and checked
before a second one is allowed to. `previewUndoRun` and `undoRun` share a
private `planUndoRun`, the same preview/apply split every other correction
in this feature already uses, for the same reason: a network round trip
between "what would this do" and "do it" is one more chance for the
underlying data to have moved.

The script itself was left alone rather than rewritten to call the service —
it has no `userId` to scope by (an operator running it already has database
access), and the two now agree by construction: both read the exact same
fields, split rows the exact same way, exercised by the same e2e file the
script already had (`undo-bank-sync-run.e2e-spec.ts`, unmodified) alongside
a new one for the HTTP surface
(`bank-sync-run-history.e2e-spec.ts`). Frontend is
`BankSyncHistoryPage.vue`, at `/bank-sync/history`, linked from the same
three places `/import/history` already was — the navbar, the user dropdown,
and the "Réglages généraux" data-links list — modeled on
`ImportHistoryPage.vue` but with a preview-then-confirm undo instead of a
bare delete, since a run's undo can leave a row blocked and that has to be
said before it's done, not after.

**A rule before the model, requested the same day.** AI categorization
shipped asking the model about every inserted row; the user asked whether
the ledger this user already has — years of a CSV import's own filing —
could answer first, the way `account-mapping.ts`'s `proposeMapping` already
answers "which account is this" from the same kind of evidence rather than
asking anyone. It can, on the same terms: `category-rules.ts`'s
`proposeCategoryFromHistory` gathers this user's own already-filed
transactions whose label scores at or above 0.5 on `labelSimilarity` (the
Jaccard word-overlap reconciliation already uses to break a tie) against the
new one, of the same sign, and proposes their category only when at least
three agree and they agree at least three times out of four — refusing,
like `proposeMapping`, a merchant that has genuinely moved between
categories rather than picking a side.

`categorizeInserts` runs this per row before ever building a model batch;
what a rule resolves never reaches the model at all. What is left goes to
`AiSuggestionsService.categorizeTransactions` as before, now grounded with
this user's own history too — `findSimilarExamples` finds up to two
already-filed rows close enough to be worth showing (a looser floor, 0.3,
than the rule's own — near enough to inform a guess without being sure
enough to make one on its own) and each one's transaction line in the
prompt carries them inline, so the model reads what this user's own habits
say about a similar purchase instead of the category names alone.

Left for later, on purpose: the CSV import's own opt-in model path
(`TransactionsService.filingFromModel`) does not call
`proposeCategoryFromHistory` yet — `categorizeTransactions`'s new `history`
parameter defaults to empty, so that path is unchanged. The benefit is the
same there; nothing in this conversation asked for it yet.

### Deliberately not now

- **The arbitration screen** for ambiguous matches: 1 case in 1 954 once
  accounts are mapped. Building it before that number moves is speculation.
- **Per-user encrypted credentials**: still waiting on Enable Banking support,
  who were asked whether one application may cover a handful of friends'
  accounts. A yes removes the work entirely. Worth chasing.

### Unrelated but overdue

`GET /users` and `GET /users/:id` are authenticated but not scoped to the
caller: any logged-in user can list every user and their email. Harmless with
one user, a leak with two — and the database already holds two.
