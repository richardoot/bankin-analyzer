-- Who asked for a sync: MANUAL for a person pressing the button, SCHEDULED
-- for the daily cron. The history owes the user that distinction — a sync
-- they never started must say so. Every existing run was manual by
-- construction, which is what makes this a default rather than a backfill.
ALTER TABLE "app"."bank_sync_runs"
  ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'MANUAL';
