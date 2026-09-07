-- A run stops pointing at any transaction once undone — a deleted row is
-- gone, an unlinked one no longer names it — so "undone" and "touched
-- nothing" would otherwise look identical. This is the one bit that tells
-- them apart, and what a second undo attempt is refused on.

-- AlterTable
ALTER TABLE "app"."bank_sync_runs" ADD COLUMN "undone_at" TIMESTAMP(3);
