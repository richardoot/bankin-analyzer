# Enable Banking — what the API actually gives, and what to do with it

Measured against 3 822 real transactions fetched from Revolut, CIC and
Boursorama, plus the OpenAPI specification. The distinction matters: the spec
describes a rich payload, and most of it arrives empty.

## What a transaction actually contains

Percentage of transactions where the field is present and non-empty.

| field                       | Revolut |   CIC | Boursorama |
| --------------------------- | ------: | ----: | ---------: |
| `entry_reference`           |   100 % | 100 % |      100 % |
| `transaction_amount`        |   100 % | 100 % |      100 % |
| `credit_debit_indicator`    |   100 % | 100 % |      100 % |
| `status`                    |   100 % | 100 % |      100 % |
| `remittance_information`    |   100 % | 100 % |      100 % |
| `value_date`                |   100 % | 100 % |       99 % |
| `booking_date`              |   100 % | 100 % |       99 % |
| `transaction_date`          |     0 % |  22 % |       56 % |
| `creditor` / `debtor`       |   100 % |   0 % |        0 % |
| `bank_transaction_code`     |   100 % |   0 % |        0 % |
| `merchant_category_code`    |       — |     — |          — |
| `balance_after_transaction` |       — |     — |          — |
| `transaction_id`            |       — |     — |          — |

**Six fields are dependable everywhere**: the reference, the amount, its
direction, the status, the label and a date. Everything the sync is built on
comes from exactly that set, and there is no unexploited signal hiding in the
payload.

`creditor`, `debtor` and `bank_transaction_code` are Revolut only, and even
there `bank_transaction_code` is Revolut's own vocabulary (`CARD_PAYMENT`)
rather than the ISO 20022 domain/family codes the spec implies. Treat all three
as a bonus, never as a rule.

Two absences settle open questions. `merchant_category_code` is empty
everywhere, so categorisation has nothing but the label to work from — which is
why phase 6 learns from the user's own filing history. And
`balance_after_transaction` is absent, so a running balance cannot be used to
prove a fetched sequence is complete.

`booking_date` missing on 1 % of Boursorama rows is why `transactionDate` falls
back through `transaction_date` and `value_date` rather than assuming.

## Endpoints worth using that we do not

### `GET /accounts/{uid}/details` — the account type

Returns what neither the session nor the transactions carry:

```
M BOILLEY RICHARD            CACC   CAV - BOURSOBANK    FR76406188033…
Carte Visa Ultim - RICHARD   CARD   Carte à débit immédiat   (no IBAN)
```

`cash_account_type` is ISO 20022 and standard: `CACC` is a current account,
`CARD` is a card account. This is the discriminator the double-counting problem
needed since phase 2, and it is structural rather than inferred — the
transaction-overlap heuristic could never find it, because a card and the
account it settles onto genuinely share their transactions.

It works on an existing session, so it can be called at any time.

### `GET /accounts/{uid}/balances` — freshness, and a completeness check

```json
{ "balance_type": "CLBD", "amount": "-19.57",
  "reference_date": "2026-09-03", "last_committed_transaction": "2026-09-02" }
{ "balance_type": "XPCD", "amount": "-29.56", … }
```

`CLBD` is the accounted balance, `XPCD` the same including what is pending.

`last_committed_transaction` is the useful one: it dates the bank's most recent
booked transaction. Comparing it to our own latest row for that account answers
"is there anything new?" without paginating through transactions. Tried against
the real ledger it reported a two-day lag correctly.

The balances also allow a completeness check the transactions cannot. The
absolute balance is unusable — our ledger does not start at account opening —
but the _difference_ between two syncs must equal the sum of the transactions
booked between them. When it does not, something was missed, and that is worth
knowing before the totals drift.

### Query parameters on transactions

`strategy=longest` is what we always send, and it is right for the fetch that
follows an authorization. For a routine sync, `date_from` bounds the request to
what is actually new. `transaction_status` filters, which matters once pending
transactions are handled: `PDNG` rows change and must be refetched, `BOOK` rows
do not.

### `psu_id` on `POST /auth`

An identifier the application chooses, returned hashed as `psu_id_hash`, whose
documented purpose is to match sessions of the same user. Today
`ingest-bank-run` finds the connection to attach a fetch to by ASPSP name,
which is fragile and was already wrong once. The hash is a proper key, and it
survives the re-authorization that a lapsed consent forces.

### `identification_hashes` — plural

The account identity across sessions, and it is a _list_: an account may carry
several. Matching must intersect the sets, not compare a single value.

## What does not exist

**No webhooks for account information.** The spec has them for payment status
only, so there is no push when a transaction lands: polling is the only design
available, which is what phase 5 assumes.

**No account descriptions on `GET /sessions/{id}`.** That endpoint returns bare
ids and identification hashes; the names, IBANs and types come from the
authorization response or from `/accounts/{uid}/details`. Whatever is needed
later must be captured and stored, not re-read from the session.

## Consequences

1. `BankAccountLink` should store `cashAccountType`, `product` and the IBAN,
   fetched from `/details` at link time. The ingestion default then follows the
   type rather than a heuristic.
2. A sync should ask `/balances` first and skip the fetch when
   `last_committed_transaction` has not moved.
3. The balance delta between two syncs is a completeness check worth running.
4. Routine fetches should use `date_from`; only a post-authorization fetch
   needs `strategy=longest`.
5. Connections should be keyed on `psu_id_hash`, not the ASPSP name.
6. Nothing in the payload will ever categorise a transaction. That job stays
   with the user's own history.
