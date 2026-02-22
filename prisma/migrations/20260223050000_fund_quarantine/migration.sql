-- CreateEnum
CREATE TYPE "FqStatus" AS ENUM ('ACTIVE', 'RELEASED', 'EXPIRED');

-- CreateTable
CREATE TABLE "fq_quarantines" (
    "id" TEXT NOT NULL,
    "serviceAgreementId" TEXT,
    "budgetLineId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "supportItemCode" TEXT,
    "quarantinedCents" INTEGER NOT NULL,
    "usedCents" INTEGER NOT NULL DEFAULT 0,
    "fundingPeriodId" TEXT,
    "status" "FqStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fq_quarantines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fq_quarantines_budgetLineId_providerId_supportItemCode_key" ON "fq_quarantines"("budgetLineId", "providerId", "supportItemCode");

-- CreateIndex
CREATE INDEX "fq_quarantines_budgetLineId_idx" ON "fq_quarantines"("budgetLineId");

-- CreateIndex
CREATE INDEX "fq_quarantines_providerId_idx" ON "fq_quarantines"("providerId");

-- CreateIndex
CREATE INDEX "fq_quarantines_status_idx" ON "fq_quarantines"("status");

-- AddForeignKey
ALTER TABLE "fq_quarantines" ADD CONSTRAINT "fq_quarantines_serviceAgreementId_fkey" FOREIGN KEY ("serviceAgreementId") REFERENCES "sa_service_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fq_quarantines" ADD CONSTRAINT "fq_quarantines_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "plan_budget_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fq_quarantines" ADD CONSTRAINT "fq_quarantines_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "crm_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fq_quarantines" ADD CONSTRAINT "fq_quarantines_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
