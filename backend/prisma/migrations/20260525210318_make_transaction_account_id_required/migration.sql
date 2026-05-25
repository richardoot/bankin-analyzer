-- ============================================
-- Make transaction.account_id NOT NULL + ON DELETE RESTRICT
-- ============================================
-- Phase 2 hardening: now that every transaction is linked to an account
-- (backfilled by 20260525195201_backfill_transaction_account_id and the
-- import code has been patched to set account_id), enforce the invariant
-- at the schema level.
--
-- - NOT NULL: a transaction must always belong to an account.
-- - ON DELETE RESTRICT: an account can no longer be deleted as a side
--   effect (the previous SET NULL behaviour is what caused the P0
--   data-loss bug).

-- Step 1: Drop the old FK (currently ON DELETE SET NULL)
ALTER TABLE "app"."transactions"
  DROP CONSTRAINT "transactions_account_id_fkey";

-- Step 2: Safety net — re-run the backfill in case any rows slipped through
-- between Phase 1 and Phase 2 (e.g. imports made on an older code path).
UPDATE "app"."transactions" t
SET account_id = a.id
FROM "app"."accounts" a
WHERE t.user_id = a.user_id
  AND t.account = a.name
  AND t.account_id IS NULL;

-- Step 3: Enforce NOT NULL. This will fail (intentionally) if any
-- transaction still has account_id IS NULL — investigate before retrying.
ALTER TABLE "app"."transactions"
  ALTER COLUMN "account_id" SET NOT NULL;

-- Step 4: Recreate the FK with ON DELETE RESTRICT
ALTER TABLE "app"."transactions"
  ADD CONSTRAINT "transactions_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
