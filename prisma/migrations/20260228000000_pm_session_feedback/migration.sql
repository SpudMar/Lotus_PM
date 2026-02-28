-- PM Session Feedback — schema migration
-- Adds: RejectionSource, invoice versioning, approval re-request, claim types,
--        approval rules, provider-participant blocks, approved supports,
--        correspondence/document entity linking

-- CreateEnum: RejectionSource
CREATE TYPE "RejectionSource" AS ENUM ('PM_REJECTED', 'PARTICIPANT_DECLINED', 'NDIA_REJECTED');

-- CreateEnum: ClmClaimType
CREATE TYPE "ClmClaimType" AS ENUM ('STANDARD', 'MANUAL_ENQUIRY');

-- AlterEnum: InvStatus — add SUPERSEDED
ALTER TYPE "InvStatus" ADD VALUE 'SUPERSEDED';

-- AlterTable: inv_invoices — rejection source, versioning, approval re-request
ALTER TABLE "inv_invoices" ADD COLUMN "rejectionSource" "RejectionSource";
ALTER TABLE "inv_invoices" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "inv_invoices" ADD COLUMN "supersededById" TEXT;
ALTER TABLE "inv_invoices" ADD COLUMN "supersededAt" TIMESTAMP(3);
ALTER TABLE "inv_invoices" ADD COLUMN "approvalClarificationNote" TEXT;
ALTER TABLE "inv_invoices" ADD COLUMN "approvalRequestCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: clm_claims — claim type and manual enquiry
ALTER TABLE "clm_claims" ADD COLUMN "claimType" "ClmClaimType" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "clm_claims" ADD COLUMN "manualEnquiryNote" TEXT;

-- AlterTable: crm_correspondence — entity linking
ALTER TABLE "crm_correspondence" ADD COLUMN "planId" TEXT;
ALTER TABLE "crm_correspondence" ADD COLUMN "saId" TEXT;

-- AlterTable: doc_documents — plan linking
ALTER TABLE "doc_documents" ADD COLUMN "planId" TEXT;

-- CreateTable: participant_approval_rules
CREATE TABLE "participant_approval_rules" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "providerId" TEXT,
    "requireApproval" BOOLEAN NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: provider_participant_blocks
CREATE TABLE "provider_participant_blocks" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "blockAllLines" BOOLEAN NOT NULL DEFAULT true,
    "blockedLineItems" TEXT[],
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolveNote" TEXT,

    CONSTRAINT "provider_participant_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: participant_approved_supports
CREATE TABLE "participant_approved_supports" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "restrictedMode" BOOLEAN NOT NULL DEFAULT false,
    "allowedItemCodes" TEXT[],
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participant_approved_supports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraints
CREATE UNIQUE INDEX "inv_invoices_supersededById_key" ON "inv_invoices"("supersededById");
CREATE UNIQUE INDEX "participant_approval_rules_participantId_providerId_key" ON "participant_approval_rules"("participantId", "providerId");
CREATE UNIQUE INDEX "participant_approved_supports_participantId_categoryCode_key" ON "participant_approved_supports"("participantId", "categoryCode");

-- AddForeignKey: invoice versioning
ALTER TABLE "inv_invoices" ADD CONSTRAINT "inv_invoices_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "inv_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: correspondence entity linking
ALTER TABLE "crm_correspondence" ADD CONSTRAINT "crm_correspondence_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_correspondence" ADD CONSTRAINT "crm_correspondence_saId_fkey" FOREIGN KEY ("saId") REFERENCES "sa_service_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: document plan linking
ALTER TABLE "doc_documents" ADD CONSTRAINT "doc_documents_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: participant_approval_rules
ALTER TABLE "participant_approval_rules" ADD CONSTRAINT "participant_approval_rules_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "participant_approval_rules" ADD CONSTRAINT "participant_approval_rules_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "crm_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "participant_approval_rules" ADD CONSTRAINT "participant_approval_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: provider_participant_blocks
ALTER TABLE "provider_participant_blocks" ADD CONSTRAINT "provider_participant_blocks_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_participant_blocks" ADD CONSTRAINT "provider_participant_blocks_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "crm_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_participant_blocks" ADD CONSTRAINT "provider_participant_blocks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_participant_blocks" ADD CONSTRAINT "provider_participant_blocks_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: participant_approved_supports
ALTER TABLE "participant_approved_supports" ADD CONSTRAINT "participant_approved_supports_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "participant_approved_supports" ADD CONSTRAINT "participant_approved_supports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
