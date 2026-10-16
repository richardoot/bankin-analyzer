-- Hidden categories are gone.
--
-- Hiding a category from the dashboard was a way round the missing transfer
-- type. Since the category framework, the movements to neutralise are
-- transfers and leave the totals by their type, and every list was empty in
-- production when this was written (checked 2026-10-15).

ALTER TABLE "app"."filter_preferences"
    DROP COLUMN "hidden_expense_category_ids",
    DROP COLUMN "hidden_income_category_ids",
    DROP COLUMN "global_hidden_expense_category_ids",
    DROP COLUMN "global_hidden_income_category_ids";
