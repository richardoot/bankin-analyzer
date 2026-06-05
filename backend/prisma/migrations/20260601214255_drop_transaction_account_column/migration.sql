-- ============================================
-- Drop the legacy transactions.account column
-- ============================================
-- The string column was kept for backward compatibility and as the source of
-- the legacy hash formula. After 20260525210318 (account_id NOT NULL) and
-- the rehash script that switched every existing hash to the v2 formula
-- (which uses account_id), the column is no longer read by the application.
--
-- The account name is now sourced exclusively through the Account relation
-- (transactions.account_id → accounts.name).

ALTER TABLE "app"."transactions" DROP COLUMN "account";
