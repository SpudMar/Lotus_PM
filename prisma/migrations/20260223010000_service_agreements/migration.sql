-- Migration: 20260223010000_service_agreements
-- WS1: Service Agreements — Provider <-> Participant agreements with rate lines
-- Adds SaStatus enum, SUPPORT_COORDINATOR role value, sa_service_agreements,
-- sa_rate_lines tables, and serviceAgreementId column on doc_documents.

-- Enums

DO $$ BEGIN
  CREATE TYPE "SaStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add SUPPORT_COORDINATOR to CoreRole enum
DO $$ BEGIN
  ALTER TYPE "CoreRole" ADD VALUE IF NOT EXISTS 'SUPPORT_COORDINATOR';
EXCEPTION WHEN others THEN NULL;
END $$;

-- Tables

CREATE TABLE IF NOT EXISTS "sa_service_agreements" (
  "id"            TEXT        NOT NULL,
  "agreementRef"  TEXT        NOT NULL,
  "participantId" TEXT        NOT NULL,
  "providerId"    TEXT        NOT NULL,
  "startDate"     TIMESTAMP(3) NOT NULL,
  "endDate"       TIMESTAMP(3) NOT NULL,
  "reviewDate"    TIMESTAMP(3),
  "status"        "SaStatus"  NOT NULL DEFAULT 'DRAFT',
  "notes"         TEXT,
  "managedById"   TEXT        NOT NULL,
  "deletedAt"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sa_service_agreements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sa_rate_lines" (
  "id"              TEXT        NOT NULL,
  "agreementId"     TEXT        NOT NULL,
  "categoryCode"    TEXT        NOT NULL,
  "categoryName"    TEXT        NOT NULL,
  "supportItemCode" TEXT,
  "supportItemName" TEXT,
  "agreedRateCents" INTEGER     NOT NULL,
  "maxQuantity"     DECIMAL(65,30),
  "unitType"        TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sa_rate_lines_pkey" PRIMARY KEY ("id")
);

-- Foreign Keys

DO $$ BEGIN
  ALTER TABLE "sa_service_agreements"
    ADD CONSTRAINT "sa_service_agreements_participantId_fkey"
      FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sa_service_agreements"
    ADD CONSTRAINT "sa_service_agreements_providerId_fkey"
      FOREIGN KEY ("providerId") REFERENCES "crm_providers"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sa_service_agreements"
    ADD CONSTRAINT "sa_service_agreements_managedById_fkey"
      FOREIGN KEY ("managedById") REFERENCES "core_users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sa_rate_lines"
    ADD CONSTRAINT "sa_rate_lines_agreementId_fkey"
      FOREIGN KEY ("agreementId") REFERENCES "sa_service_agreements"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Unique Constraints

DO $$ BEGIN
  ALTER TABLE "sa_service_agreements"
    ADD CONSTRAINT "sa_service_agreements_agreementRef_key" UNIQUE ("agreementRef");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes

DO $$ BEGIN
  CREATE INDEX "sa_service_agreements_participantId_idx"
    ON "sa_service_agreements"("participantId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX "sa_service_agreements_providerId_idx"
    ON "sa_service_agreements"("providerId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX "sa_service_agreements_status_idx"
    ON "sa_service_agreements"("status");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX "sa_rate_lines_agreementId_idx"
    ON "sa_rate_lines"("agreementId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- doc_documents: add serviceAgreementId

ALTER TABLE "doc_documents"
  ADD COLUMN IF NOT EXISTS "serviceAgreementId" TEXT;

DO $$ BEGIN
  ALTER TABLE "doc_documents"
    ADD CONSTRAINT "doc_documents_serviceAgreementId_fkey"
      FOREIGN KEY ("serviceAgreementId") REFERENCES "sa_service_agreements"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
