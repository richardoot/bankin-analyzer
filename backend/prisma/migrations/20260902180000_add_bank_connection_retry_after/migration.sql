-- Somewhere to record that the bank has had enough for now.
--
-- Most ASPSPs allow four background fetches a day and answer the fifth with
-- ASPSP_RATE_LIMIT_EXCEEDED, saying nothing useful about when to return.
-- Enable Banking's own advice is to wait six hours; guessing shorter earns
-- another refusal and spends one of the day's few requests earning it.
--
-- Nullable and unset by default: a connection that has never been refused has
-- nothing to wait for.
ALTER TABLE "app"."bank_connections"
  ADD COLUMN IF NOT EXISTS "retry_after" TIMESTAMP(3);
