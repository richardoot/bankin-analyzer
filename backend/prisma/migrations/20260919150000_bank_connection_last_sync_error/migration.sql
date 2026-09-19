-- What the last failed sync said, kept until a sync succeeds. The nightly
-- cron has no screen: the connection carries the message and the Comptes
-- page reads it — the state is the channel, not a notification.
ALTER TABLE "app"."bank_connections"
  ADD COLUMN "last_sync_error" TEXT,
  ADD COLUMN "last_sync_error_at" TIMESTAMP(3);
