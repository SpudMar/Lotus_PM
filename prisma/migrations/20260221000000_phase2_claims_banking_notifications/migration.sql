-- Phase 2: Claims & Payments — schema additions
-- Adds missing fields to clm_claims, new tables for batches, claim lines, and notifications.

-- CreateEnum
CREATE TYPE "ClmBatchStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'PARTIALLY_COMPLETED');

-- CreateEnum
CREATE TYPE "ClmLineStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "NtfType" AS ENUM ('INFO', 'WARNING', 'ACTION_REQUIRED', 'SUCCESS');

-- CreateEnum
CREATE TYPE "NtfCategory" AS ENUM ('INVOICE', 'CLAIM', 'PAYMENT', 'PLAN', 'COMPLIANCE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NtfPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NtfChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');

-- CreateTable: clm_batches
CREATE TABLE "clm_batches" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "claimCount" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "approvedCents" INTEGER NOT NULL DEFAULT 0,
    "status" "ClmBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "prodaBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clm_batches_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add new columns to clm_claims
-- claimReference: required unique identifier (e.g. "CLM-2026-0001")
ALTER TABLE "clm_claims" ADD COLUMN "claimReference" TEXT NOT NULL DEFAULT '';
ALTER TABLE "clm_claims" ALTER COLUMN "claimReference" DROP DEFAULT;

-- participantId: denormalised for easier querying/filtering
ALTER TABLE "clm_claims" ADD COLUMN "participantId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "clm_claims" ALTER COLUMN "participantId" DROP DEFAULT;

-- batchId: optional batch grouping
ALTER TABLE "clm_claims" ADD COLUMN "batchId" TEXT;

-- submittedById / outcomeById: staff user references
ALTER TABLE "clm_claims" ADD COLUMN "submittedById" TEXT;
ALTER TABLE "clm_claims" ADD COLUMN "outcomeById" TEXT;

-- CreateTable: clm_claim_lines
CREATE TABLE "clm_claim_lines" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "invoiceLineId" TEXT,
    "supportItemCode" TEXT NOT NULL,
    "supportItemName" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "gstCents" INTEGER NOT NULL DEFAULT 0,
    "approvedCents" INTEGER NOT NULL DEFAULT 0,
    "status" "ClmLineStatus" NOT NULL DEFAULT 'PENDING',
    "outcomeNotes" TEXT,

    CONSTRAINT "clm_claim_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ntf_notifications
CREATE TABLE "ntf_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NtfType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "category" "NtfCategory" NOT NULL,
    "priority" "NtfPriority" NOT NULL DEFAULT 'NORMAL',
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "channels" "NtfChannel"[] DEFAULT ARRAY['IN_APP']::"NtfChannel"[],
    "emailSentAt" TIMESTAMP(3),
    "smsSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ntf_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: clm_batches
CREATE UNIQUE INDEX "clm_batches_batchNumber_key" ON "clm_batches"("batchNumber");
CREATE UNIQUE INDEX "clm_batches_prodaBatchId_key" ON "clm_batches"("prodaBatchId");
CREATE INDEX "clm_batches_status_idx" ON "clm_batches"("status");

-- CreateIndex: clm_claims new columns
CREATE UNIQUE INDEX "clm_claims_claimReference_key" ON "clm_claims"("claimReference");
CREATE INDEX "clm_claims_participantId_idx" ON "clm_claims"("participantId");
CREATE INDEX "clm_claims_batchId_idx" ON "clm_claims"("batchId");

-- CreateIndex: clm_claim_lines
CREATE INDEX "clm_claim_lines_claimId_idx" ON "clm_claim_lines"("claimId");

-- CreateIndex: ntf_notifications
CREATE INDEX "ntf_notifications_userId_readAt_idx" ON "ntf_notifications"("userId", "readAt");
CREATE INDEX "ntf_notifications_userId_createdAt_idx" ON "ntf_notifications"("userId", "createdAt");
CREATE INDEX "ntf_notifications_category_idx" ON "ntf_notifications"("category");

-- AddForeignKey: clm_batches
ALTER TABLE "clm_batches" ADD CONSTRAINT "clm_batches_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: clm_claims new columns
ALTER TABLE "clm_claims" ADD CONSTRAINT "clm_claims_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clm_claims" ADD CONSTRAINT "clm_claims_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "clm_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clm_claims" ADD CONSTRAINT "clm_claims_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clm_claims" ADD CONSTRAINT "clm_claims_outcomeById_fkey" FOREIGN KEY ("outcomeById") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: clm_claim_lines
ALTER TABLE "clm_claim_lines" ADD CONSTRAINT "clm_claim_lines_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "clm_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clm_claim_lines" ADD CONSTRAINT "clm_claim_lines_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "inv_invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: ntf_notifications
ALTER TABLE "ntf_notifications" ADD CONSTRAINT "ntf_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
