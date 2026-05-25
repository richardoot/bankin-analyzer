-- ============================================
-- Backfill transaction.account_id
-- ============================================
-- Context: importTransactions was creating transactions without setting
-- account_id (only the string column `account`). Combined with the
-- orphan-account cleanup in deleteImport, this caused all Accounts to be
-- silently deleted whenever an import was removed.
--
-- This migration:
--   1. Recreates Accounts that were lost (from transaction.account strings
--      that no longer have a matching Account row).
--   2. Backfills transaction.account_id wherever it is NULL but a matching
--      Account exists.
--
-- Recreated accounts default to STANDARD / divisor=1. Users will have to
-- re-apply JOINT/INVESTMENT settings manually via the UI — the original
-- configuration was lost when the Account row was deleted.

-- Step 1: Recreate missing accounts from transaction.account names
INSERT INTO "app"."accounts" ("id", "user_id", "name", "type", "divisor", "updated_at")
SELECT gen_random_uuid(), t.user_id, t.account, 'STANDARD', 1, NOW()
FROM (
    SELECT DISTINCT user_id, account
    FROM "app"."transactions"
    WHERE account IS NOT NULL
      AND account <> ''
      AND account_id IS NULL
) t
ON CONFLICT ("user_id", "name") DO NOTHING;

-- Step 2: Backfill transaction.account_id from transaction.account
UPDATE "app"."transactions" t
SET account_id = a.id
FROM "app"."accounts" a
WHERE t.user_id = a.user_id
  AND t.account = a.name
  AND t.account_id IS NULL;
