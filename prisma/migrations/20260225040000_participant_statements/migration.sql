-- Participant Statements
CREATE TYPE "StatementFrequency" AS ENUM ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'NONE');
CREATE TYPE "StatementDelivery" AS ENUM ('EMAIL', 'SMS', 'MAIL');

-- Statement preferences on participant
ALTER TABLE "crm_participants" ADD COLUMN "statementFrequency" "StatementFrequency" DEFAULT 'MONTHLY';
ALTER TABLE "crm_participants" ADD COLUMN "statementDelivery" "StatementDelivery" DEFAULT 'EMAIL';
ALTER TABLE "crm_participants" ADD COLUMN "statementEmail" TEXT;
ALTER TABLE "crm_participants" ADD COLUMN "statementPhone" TEXT;

-- Participant Statement table
CREATE TABLE "participant_statements" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveryMethod" "StatementDelivery" NOT NULL DEFAULT 'EMAIL',
    "s3Key" TEXT,
    "totalInvoicedCents" INTEGER NOT NULL,
    "totalClaimedCents" INTEGER NOT NULL,
    "totalPaidCents" INTEGER NOT NULL,
    "budgetRemainingCents" INTEGER NOT NULL,
    "lineItems" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "participant_statements_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "participant_statements_participantId_idx" ON "participant_statements"("participantId");
CREATE INDEX "participant_statements_periodStart_periodEnd_idx" ON "participant_statements"("periodStart", "periodEnd");

-- Foreign Key
ALTER TABLE "participant_statements" ADD CONSTRAINT "participant_statements_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
