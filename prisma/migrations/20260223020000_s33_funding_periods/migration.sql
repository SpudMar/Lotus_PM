-- CreateTable
CREATE TABLE "plan_funding_periods" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_funding_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_period_budgets" (
    "id" TEXT NOT NULL,
    "fundingPeriodId" TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "allocatedCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_period_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_period_budgets_fundingPeriodId_budgetLineId_key" ON "plan_period_budgets"("fundingPeriodId", "budgetLineId");

-- AddForeignKey
ALTER TABLE "plan_funding_periods" ADD CONSTRAINT "plan_funding_periods_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_period_budgets" ADD CONSTRAINT "plan_period_budgets_fundingPeriodId_fkey" FOREIGN KEY ("fundingPeriodId") REFERENCES "plan_funding_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_period_budgets" ADD CONSTRAINT "plan_period_budgets_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "plan_budget_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
