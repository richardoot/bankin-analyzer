-- AlterTable
ALTER TABLE "app"."tags" ADD COLUMN     "is_exceptional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "event_start_date" DATE,
ADD COLUMN     "event_end_date" DATE;
