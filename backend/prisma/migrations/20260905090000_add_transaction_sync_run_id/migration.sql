-- A synced transaction remembers which run last wrote to it, the same way a
-- CSV row remembers which import created it. Without this, undoing a sync
-- run had no way to find what it touched: `bank_sync_runs` existed and
-- nothing referenced it back.

-- AlterTable
ALTER TABLE "app"."transactions" ADD COLUMN "sync_run_id" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "transactions_sync_run_id_idx" ON "app"."transactions"("sync_run_id");

-- AddForeignKey
-- SET NULL rather than CASCADE: the run being deleted must not take the
-- transaction it wrote with it, only the memory of which run wrote it.
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "app"."bank_sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
