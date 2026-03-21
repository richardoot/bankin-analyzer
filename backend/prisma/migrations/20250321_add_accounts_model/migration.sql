-- CreateEnum
CREATE TYPE "app"."AccountType" AS ENUM ('STANDARD', 'JOINT', 'INVESTMENT');

-- CreateTable
CREATE TABLE "app"."accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "app"."AccountType" NOT NULL DEFAULT 'STANDARD',
    "divisor" INTEGER NOT NULL DEFAULT 1,
    "is_excluded_from_budget" BOOLEAN NOT NULL DEFAULT false,
    "is_excluded_from_stats" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "app"."accounts"("user_id");
CREATE INDEX "accounts_user_id_type_idx" ON "app"."accounts"("user_id", "type");
CREATE UNIQUE INDEX "accounts_user_id_name_key" ON "app"."accounts"("user_id", "name");

-- AddForeignKey
ALTER TABLE "app"."accounts" ADD CONSTRAINT "accounts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add account_id to transactions
ALTER TABLE "app"."transactions" ADD COLUMN "account_id" TEXT;

-- CreateIndex for account_id
CREATE INDEX "transactions_account_id_idx" ON "app"."transactions"("account_id");

-- ============================================
-- DATA MIGRATION: Create accounts from existing data
-- ============================================

-- Step 1: Create accounts from unique account names in transactions
INSERT INTO "app"."accounts" ("id", "user_id", "name", "type", "divisor", "updated_at")
SELECT
    gen_random_uuid(),
    t.user_id,
    t.account,
    'STANDARD',
    1,
    NOW()
FROM (
    SELECT DISTINCT user_id, account
    FROM "app"."transactions"
) t
ON CONFLICT ("user_id", "name") DO NOTHING;

-- Step 2: Update accounts that were marked as joint in filter_preferences
UPDATE "app"."accounts" a
SET
    "type" = 'JOINT',
    "divisor" = 2
FROM "app"."filter_preferences" fp
WHERE a.user_id = fp.user_id
  AND a.name = ANY(fp.joint_accounts);

-- Step 3: Link transactions to their accounts
UPDATE "app"."transactions" t
SET account_id = a.id
FROM "app"."accounts" a
WHERE t.user_id = a.user_id
  AND t.account = a.name;

-- ============================================
-- CLEANUP: Remove deprecated columns from filter_preferences
-- ============================================

-- Remove jointAccounts column
ALTER TABLE "app"."filter_preferences" DROP COLUMN IF EXISTS "joint_accounts";

-- Remove deprecated categoryAssociations JSON column
ALTER TABLE "app"."filter_preferences" DROP COLUMN IF EXISTS "category_associations";

-- ============================================
-- Add foreign key constraint for transactions.account_id
-- (after data migration, so all transactions have an account)
-- ============================================

ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
