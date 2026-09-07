-- `external_account_id` is the bank's handle within a session and is
-- refreshed on every authorization — looking a link up by it, as
-- `completeAuthorization` used to, means a renewal never finds the account it
-- already knew and inserts a second row for it instead. Observed for real: a
-- CIC current account, re-authorized once, became two links sharing one IBAN.
--
-- `iban` (or `identification_hash` for the card account that has none) is
-- what actually survives between sessions, and is now what the lookup
-- matches on. These indexes are the backstop: once the lookup trusts them, a
-- real duplicate becomes a loud error rather than silence.
--
-- NULLs are distinct in a Postgres unique index, so an account with neither
-- known yet — or several — are never blocked by each other.

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "bank_account_links_connection_id_iban_key"
  ON "app"."bank_account_links"("connection_id", "iban");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "bank_account_links_connection_id_identification_hash_key"
  ON "app"."bank_account_links"("connection_id", "identification_hash");
