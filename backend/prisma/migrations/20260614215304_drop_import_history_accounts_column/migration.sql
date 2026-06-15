-- ============================================
-- Drop the denormalised import_histories.accounts column
-- ============================================
-- The column held a frozen snapshot of account names at import time, which
-- went stale after a user renamed an account. The list of accounts touched
-- by an import is now computed on read by JOINing transactions back to the
-- accounts relation, so the displayed names always match the current
-- Account.name (single source of truth).

ALTER TABLE "app"."import_histories" DROP COLUMN "accounts";
