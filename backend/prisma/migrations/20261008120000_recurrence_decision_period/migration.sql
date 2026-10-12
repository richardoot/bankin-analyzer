-- The rhythm of a charge the user marks as recurring by hand.
--
-- A single payment has no interval to read a period from, so an annual app
-- paid once would be read as monthly and ended two months later. The user
-- knows it is annual; this is where they say so. Null for decisions taken on
-- a detected series, whose rhythm the ledger already shows.
ALTER TABLE "app"."recurrence_decisions" ADD COLUMN "period" "app"."RecurrencePeriod";
