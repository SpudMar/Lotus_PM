-- CreateEnum
CREATE TYPE "InvHoldCategory" AS ENUM ('MISSING_NDIS_CODES', 'INCORRECT_AMOUNT', 'DUPLICATE_INVOICE', 'PROVIDER_NOT_APPROVED', 'BUDGET_EXCEEDED', 'AWAITING_PARTICIPANT_APPROVAL', 'AWAITING_PROVIDER_CORRECTION', 'PLAN_BUDGET_EXCEEDED', 'SYSTEM_HOLD', 'OTHER');

-- CreateTable
CREATE TABLE "inv_status_history" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "fromStatus" "InvStatus",
    "toStatus" "InvStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT,
    "holdCategory" "InvHoldCategory",
    "holdReason" TEXT,
    "metadata" JSONB,
    "durationMs" INTEGER,

    CONSTRAINT "inv_status_history_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "inv_invoices" ADD COLUMN "firstApprovedAt" TIMESTAMP(3),
ADD COLUMN "firstRejectedAt" TIMESTAMP(3),
ADD COLUMN "totalProcessingMs" INTEGER;

-- AlterTable
ALTER TABLE "crm_participants" ADD COLUMN "disabilityCategory" TEXT,
ADD COLUMN "ndisRegistrationDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "inv_status_history_invoiceId_idx" ON "inv_status_history"("invoiceId");
CREATE INDEX "inv_status_history_changedAt_idx" ON "inv_status_history"("changedAt");
CREATE INDEX "inv_status_history_toStatus_idx" ON "inv_status_history"("toStatus");

-- AddForeignKey
ALTER TABLE "inv_status_history" ADD CONSTRAINT "inv_status_history_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "inv_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
