-- Migration: Email Invoice Ingestion Fields
-- REQ-024: Invoices arrive via shared email inbox — SES inbound pipeline
-- Adds: InvIngestSource enum, email ingest fields on inv_invoices
-- Makes participantId/providerId nullable (unknown on email receipt, resolved after review)

-- ─── InvIngestSource enum ─────────────────────────────────────────────────────

CREATE TYPE "InvIngestSource" AS ENUM ('EMAIL', 'MANUAL', 'API');

-- ─── Email ingest fields on inv_invoices ──────────────────────────────────────

ALTER TABLE "inv_invoices"
    ADD COLUMN IF NOT EXISTS "sourceEmail"    TEXT,
    ADD COLUMN IF NOT EXISTS "textractJobId"  TEXT,
    ADD COLUMN IF NOT EXISTS "ingestSource"   "InvIngestSource";

-- ─── Make participantId / providerId nullable ─────────────────────────────────
-- Email-ingested drafts arrive before the participant/provider are identified.
-- Staff assign them during the PENDING_REVIEW → APPROVED workflow.

ALTER TABLE "inv_invoices" ALTER COLUMN "participantId" DROP NOT NULL;
ALTER TABLE "inv_invoices" ALTER COLUMN "providerId"    DROP NOT NULL;

-- ─── System service account ───────────────────────────────────────────────────
-- Used as userId for automated audit log entries (email ingest, scheduled jobs).
-- isActive = false prevents login. Role = GLOBAL_ADMIN for audit query visibility.

INSERT INTO "core_users" (
    "id", "email", "name", "role", "isActive", "mfaEnabled", "createdAt", "updatedAt"
) VALUES (
    'clsystem0000000000000001',
    'system@lotus-pm.internal',
    'System',
    'GLOBAL_ADMIN',
    false,
    false,
    NOW(),
    NOW()
) ON CONFLICT ("id") DO NOTHING;
