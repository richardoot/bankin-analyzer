-- AlterTable
ALTER TABLE "app"."budget_plans" ADD COLUMN     "savings_target" DECIMAL(12,2),
ADD COLUMN     "reference_income" DECIMAL(12,2);
