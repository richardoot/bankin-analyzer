-- The last balance the bank reported at sync time — closing booked (CLBD)
-- when offered. Lives on the link, not on the Account: a CSV-fed account has
-- no bank behind it and must never claim a balance it cannot know.
ALTER TABLE "app"."bank_account_links"
  ADD COLUMN "balance_amount" DECIMAL(12,2),
  ADD COLUMN "balance_currency" TEXT,
  ADD COLUMN "balance_at" TIMESTAMP(3);
