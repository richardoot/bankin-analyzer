-- AlterTable: Add global hidden categories columns to filter_preferences
ALTER TABLE "app"."filter_preferences"
ADD COLUMN "global_hidden_expense_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "global_hidden_income_categories" TEXT[] DEFAULT ARRAY[]::TEXT[];
