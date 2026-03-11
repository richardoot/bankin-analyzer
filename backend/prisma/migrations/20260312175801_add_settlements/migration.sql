-- CreateTable
CREATE TABLE "app"."settlements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "income_transaction_id" TEXT NOT NULL,
    "amount_used" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."settlement_reimbursements" (
    "id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "reimbursement_id" TEXT NOT NULL,
    "amount_settled" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "settlement_reimbursements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlements_user_id_idx" ON "app"."settlements"("user_id");

-- CreateIndex
CREATE INDEX "settlements_person_id_idx" ON "app"."settlements"("person_id");

-- CreateIndex
CREATE INDEX "settlements_income_transaction_id_idx" ON "app"."settlements"("income_transaction_id");

-- CreateIndex
CREATE INDEX "settlement_reimbursements_reimbursement_id_idx" ON "app"."settlement_reimbursements"("reimbursement_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_reimbursements_settlement_id_reimbursement_id_key" ON "app"."settlement_reimbursements"("settlement_id", "reimbursement_id");

-- AddForeignKey
ALTER TABLE "app"."settlements" ADD CONSTRAINT "settlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."settlements" ADD CONSTRAINT "settlements_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "app"."persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."settlements" ADD CONSTRAINT "settlements_income_transaction_id_fkey" FOREIGN KEY ("income_transaction_id") REFERENCES "app"."transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."settlement_reimbursements" ADD CONSTRAINT "settlement_reimbursements_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "app"."settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."settlement_reimbursements" ADD CONSTRAINT "settlement_reimbursements_reimbursement_id_fkey" FOREIGN KEY ("reimbursement_id") REFERENCES "app"."reimbursement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
