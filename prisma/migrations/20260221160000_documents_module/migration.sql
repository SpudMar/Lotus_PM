-- Migration: documents_module
-- Extends DocDocument with category enum, soft delete, and uploadedBy relation.
-- Adds DocCategory enum type.

-- Create DocCategory enum
DO $$ BEGIN
  CREATE TYPE "DocCategory" AS ENUM (
    'SERVICE_AGREEMENT',
    'PLAN_LETTER',
    'INVOICE',
    'ASSESSMENT',
    'CORRESPONDENCE',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add category column with default
ALTER TABLE "doc_documents"
  ADD COLUMN IF NOT EXISTS "category"   "DocCategory" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS "deletedAt"  TIMESTAMP(3);

-- Add uploadedBy foreign key (column already exists as plain text; add constraint)
DO $$ BEGIN
  ALTER TABLE "doc_documents"
    ADD CONSTRAINT "doc_documents_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
DO $$ BEGIN
  CREATE INDEX "doc_documents_uploadedById_idx" ON "doc_documents"("uploadedById");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX "doc_documents_category_idx" ON "doc_documents"("category");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
