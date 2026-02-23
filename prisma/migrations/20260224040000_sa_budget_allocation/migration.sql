-- CreateTable
CREATE TABLE "sa_budget_allocations" (
    "id" TEXT NOT NULL,
    "serviceAgreementId" TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "allocatedCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "sa_budget_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sa_budget_allocations_budgetLineId_idx" ON "sa_budget_allocations"("budgetLineId");

-- CreateIndex
CREATE INDEX "sa_budget_allocations_serviceAgreementId_idx" ON "sa_budget_allocations"("serviceAgreementId");

-- CreateIndex
CREATE UNIQUE INDEX "sa_budget_allocations_serviceAgreementId_budgetLineId_key" ON "sa_budget_allocations"("serviceAgreementId", "budgetLineId");

-- AddForeignKey
ALTER TABLE "sa_budget_allocations" ADD CONSTRAINT "sa_budget_allocations_serviceAgreementId_fkey" FOREIGN KEY ("serviceAgreementId") REFERENCES "sa_service_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sa_budget_allocations" ADD CONSTRAINT "sa_budget_allocations_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "plan_budget_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sa_budget_allocations" ADD CONSTRAINT "sa_budget_allocations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
