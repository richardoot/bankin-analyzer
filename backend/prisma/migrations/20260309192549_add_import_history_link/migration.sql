-- CreateEnum
CREATE TYPE "app"."ImportStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "app"."import_histories" ADD COLUMN     "status" "app"."ImportStatus" NOT NULL DEFAULT 'IN_PROGRESS',
ALTER COLUMN "transactions_imported" SET DEFAULT 0,
ALTER COLUMN "categories_created" SET DEFAULT 0,
ALTER COLUMN "duplicates_skipped" SET DEFAULT 0,
ALTER COLUMN "date_range_start" DROP NOT NULL,
ALTER COLUMN "date_range_end" DROP NOT NULL,
ALTER COLUMN "accounts" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "app"."transactions" ADD COLUMN     "import_history_id" TEXT;

-- CreateIndex
CREATE INDEX "import_histories_status_idx" ON "app"."import_histories"("status");

-- CreateIndex
CREATE INDEX "transactions_import_history_id_idx" ON "app"."transactions"("import_history_id");

-- AddForeignKey
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_import_history_id_fkey" FOREIGN KEY ("import_history_id") REFERENCES "app"."import_histories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
