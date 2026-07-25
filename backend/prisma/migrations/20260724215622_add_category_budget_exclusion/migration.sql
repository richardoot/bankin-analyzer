-- AlterTable
ALTER TABLE "app"."categories" ADD COLUMN     "is_excluded_from_budget" BOOLEAN NOT NULL DEFAULT false;
