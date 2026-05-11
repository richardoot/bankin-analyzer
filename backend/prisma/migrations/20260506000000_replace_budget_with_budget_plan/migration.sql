-- DropForeignKey
ALTER TABLE "app"."budgets" DROP CONSTRAINT "budgets_category_id_fkey";

-- DropForeignKey
ALTER TABLE "app"."budgets" DROP CONSTRAINT "budgets_user_id_fkey";

-- DropTable
DROP TABLE "app"."budgets";

-- CreateTable
CREATE TABLE "app"."budget_plans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."budget_plan_entries" (
    "id" TEXT NOT NULL,
    "budget_plan_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "budget_plan_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_plans_user_id_idx" ON "app"."budget_plans"("user_id");

-- CreateIndex
CREATE INDEX "budget_plans_user_id_start_date_end_date_idx" ON "app"."budget_plans"("user_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "budget_plan_entries_budget_plan_id_idx" ON "app"."budget_plan_entries"("budget_plan_id");

-- CreateIndex
CREATE INDEX "budget_plan_entries_category_id_idx" ON "app"."budget_plan_entries"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_plan_entries_budget_plan_id_category_id_key" ON "app"."budget_plan_entries"("budget_plan_id", "category_id");

-- AddForeignKey
ALTER TABLE "app"."budget_plans" ADD CONSTRAINT "budget_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."budget_plan_entries" ADD CONSTRAINT "budget_plan_entries_budget_plan_id_fkey" FOREIGN KEY ("budget_plan_id") REFERENCES "app"."budget_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."budget_plan_entries" ADD CONSTRAINT "budget_plan_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
