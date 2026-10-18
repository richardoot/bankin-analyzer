-- A durable purchase can be smoothed over the months it is used: an iPhone
-- bought in June and counted over 24 months weighs 1/24 of its net in every
-- everyday reading from June on, instead of 1 300 € in one month (see
-- agent-os/product/amortization-framework.md).
--
-- One column, no table: a transaction has a single smoothing, it starts at
-- the transaction's own month, and nothing reads its history. Null means not
-- smoothed, which is what every existing row is, so nothing is backfilled.
-- The bounds are the framework's: below two months there is nothing to
-- spread, above five years the purchase is not everyday life any more.
ALTER TABLE "app"."transactions"
  ADD COLUMN "amortization_months" SMALLINT,
  ADD CONSTRAINT "transactions_amortization_months_check"
    CHECK ("amortization_months" BETWEEN 2 AND 60);
