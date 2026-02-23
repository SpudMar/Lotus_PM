-- AlterTable: Add pattern-learning fields to InvInvoiceLine
ALTER TABLE "inv_invoice_lines" ADD COLUMN "suggestedItemCode" TEXT;
ALTER TABLE "inv_invoice_lines" ADD COLUMN "suggestedConfidence" DOUBLE PRECISION;
ALTER TABLE "inv_invoice_lines" ADD COLUMN "userOverrideCode" TEXT;

-- CreateTable: InvItemPattern
CREATE TABLE "inv_item_patterns" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "participantId" TEXT,
    "categoryCode" TEXT NOT NULL,
    "itemNumber" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_item_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique composite key
CREATE UNIQUE INDEX "inv_item_patterns_providerId_participantId_categoryCode_itemNumber_key" ON "inv_item_patterns"("providerId", "participantId", "categoryCode", "itemNumber");

-- CreateIndex: lookup by provider + category
CREATE INDEX "inv_item_patterns_providerId_categoryCode_idx" ON "inv_item_patterns"("providerId", "categoryCode");

-- AddForeignKey: provider
ALTER TABLE "inv_item_patterns" ADD CONSTRAINT "inv_item_patterns_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "crm_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: participant (nullable)
ALTER TABLE "inv_item_patterns" ADD CONSTRAINT "inv_item_patterns_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
