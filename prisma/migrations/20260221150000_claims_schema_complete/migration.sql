-- Migration: claims_schema_complete
-- Adds missing fields to ClmClaim, ClmClaimLine, ClmBatch models
-- Adds userId/readAt/dismissedAt/category to NotifNotification for in-app bell

-- ── ClmBatchStatus enum ───────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "ClmBatchStatus" AS ENUM ('DRAFT', 'SUBMITTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── NtfCategory enum ──────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "NtfCategory" AS ENUM ('INVOICE', 'CLAIM', 'PAYMENT', 'PLAN', 'PARTICIPANT', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── ClmBatch table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "clm_batches" (
  "id"            TEXT NOT NULL,
  "batchNumber"   TEXT NOT NULL,
  "status"        "ClmBatchStatus" NOT NULL DEFAULT 'DRAFT',
  "notes"         TEXT,
  "claimCount"    INTEGER NOT NULL,
  "totalCents"    INTEGER NOT NULL,
  "submittedById" TEXT,
  "submittedAt"   TIMESTAMP(3),
  "prodaBatchId"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clm_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "clm_batches_batchNumber_key" ON "clm_batches"("batchNumber");
CREATE INDEX IF NOT EXISTS "clm_batches_status_idx" ON "clm_batches"("status");

DO $$ BEGIN
  ALTER TABLE "clm_batches"
    ADD CONSTRAINT "clm_batches_submittedById_fkey"
      FOREIGN KEY ("submittedById") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── ClmClaim: add missing columns ─────────────────────────────────────────────
ALTER TABLE "clm_claims"
  ADD COLUMN IF NOT EXISTS "claimReference"  TEXT,
  ADD COLUMN IF NOT EXISTS "participantId"   TEXT,
  ADD COLUMN IF NOT EXISTS "batchId"         TEXT,
  ADD COLUMN IF NOT EXISTS "submittedById"   TEXT,
  ADD COLUMN IF NOT EXISTS "outcomeById"     TEXT;

-- Backfill claimReference so we can make it NOT NULL + UNIQUE
UPDATE "clm_claims" SET "claimReference" = 'CLM-MIGRATE-' || id WHERE "claimReference" IS NULL;
ALTER TABLE "clm_claims" ALTER COLUMN "claimReference" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "clm_claims" ADD CONSTRAINT "clm_claims_claimReference_key" UNIQUE ("claimReference");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "clm_claims_participantId_idx" ON "clm_claims"("participantId");
CREATE INDEX IF NOT EXISTS "clm_claims_batchId_idx" ON "clm_claims"("batchId");

DO $$ BEGIN
  ALTER TABLE "clm_claims"
    ADD CONSTRAINT "clm_claims_participantId_fkey"
      FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "clm_claims"
    ADD CONSTRAINT "clm_claims_submittedById_fkey"
      FOREIGN KEY ("submittedById") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "clm_claims"
    ADD CONSTRAINT "clm_claims_outcomeById_fkey"
      FOREIGN KEY ("outcomeById") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "clm_claims"
    ADD CONSTRAINT "clm_claims_batchId_fkey"
      FOREIGN KEY ("batchId") REFERENCES "clm_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── ClmClaimLine table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "clm_claim_lines" (
  "id"              TEXT NOT NULL,
  "claimId"         TEXT NOT NULL,
  "invoiceLineId"   TEXT,
  "supportItemCode" TEXT NOT NULL,
  "supportItemName" TEXT NOT NULL,
  "categoryCode"    TEXT NOT NULL,
  "serviceDate"     TIMESTAMP(3) NOT NULL,
  "quantity"        DOUBLE PRECISION NOT NULL,
  "unitPriceCents"  INTEGER NOT NULL,
  "totalCents"      INTEGER NOT NULL,
  "gstCents"        INTEGER NOT NULL DEFAULT 0,
  "status"          "ClmStatus",
  "approvedCents"   INTEGER,
  "outcomeNotes"    TEXT,
  CONSTRAINT "clm_claim_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "clm_claim_lines_claimId_idx" ON "clm_claim_lines"("claimId");

DO $$ BEGIN
  ALTER TABLE "clm_claim_lines"
    ADD CONSTRAINT "clm_claim_lines_claimId_fkey"
      FOREIGN KEY ("claimId") REFERENCES "clm_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "clm_claim_lines"
    ADD CONSTRAINT "clm_claim_lines_invoiceLineId_fkey"
      FOREIGN KEY ("invoiceLineId") REFERENCES "inv_invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── NotifNotification: add in-app fields ─────────────────────────────────────
ALTER TABLE "notif_notifications"
  ADD COLUMN IF NOT EXISTS "userId"      TEXT,
  ADD COLUMN IF NOT EXISTS "readAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dismissedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "category"    "NtfCategory";

CREATE INDEX IF NOT EXISTS "notif_notifications_userId_readAt_idx" ON "notif_notifications"("userId", "readAt");

DO $$ BEGIN
  ALTER TABLE "notif_notifications"
    ADD CONSTRAINT "notif_notifications_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
