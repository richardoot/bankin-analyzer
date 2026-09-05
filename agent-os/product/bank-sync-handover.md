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

**1. Exercise the flow through the screen.** Everything was validated by
scripts; nothing by the interface. Register the redirect URL, connect a bank,
map the accounts, press sync. The local database also carries 2 connections and
12 links of which 6 are stale — leftovers from the scripts, which the screen
will show.

**2. Make a sync reversible.** A CSV row knows which import created it
(`importHistoryId`); a synced row knows nothing — `BankSyncRun` exists and no
transaction references it. Add `syncRunId`, then the script that undoes a run:
delete what it inserted, unlink what it claimed, touch nothing else. `source`
already makes that distinction possible. This matters more now that a click
starts the whole thing.

**3. Key connections on `psu_id_hash`.** They are keyed on the ASPSP name,
which already created a duplicate connection when the name changed. `psu_id` is
already sent at authorization; store the returned hash and use it.

**4. Add a date floor to ingestion.** The API reaches further back than the CSV
ever did — four months, measured — which changes totals for periods the user
considered settled. The deep window reopens at every re-authorization, so this
recurs.

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
