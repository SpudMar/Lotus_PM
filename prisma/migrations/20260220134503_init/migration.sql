-- CreateEnum
CREATE TYPE "CoreRole" AS ENUM ('DIRECTOR', 'PLAN_MANAGER', 'ASSISTANT', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "CommType" AS ENUM ('EMAIL', 'PHONE', 'SMS', 'IN_PERSON', 'PORTAL_MESSAGE', 'NOTE');

-- CreateEnum
CREATE TYPE "CommDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'UNDER_REVIEW', 'INACTIVE');

-- CreateEnum
CREATE TYPE "InvStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CLAIMED', 'PAID');

-- CreateEnum
CREATE TYPE "ClmStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "BnkPaymentStatus" AS ENUM ('PENDING', 'IN_ABA_FILE', 'SUBMITTED_TO_BANK', 'CLEARED', 'FAILED', 'REVERSED');

-- CreateTable
CREATE TABLE "core_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "CoreRole" NOT NULL DEFAULT 'ASSISTANT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "core_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "core_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "core_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "core_audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_participants" (
    "id" TEXT NOT NULL,
    "ndisNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "suburb" TEXT,
    "state" TEXT,
    "postcode" TEXT,
    "assignedToId" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "onboardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abn" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "ndisRegistered" BOOLEAN NOT NULL DEFAULT true,
    "registrationNo" TEXT,
    "bankBsb" TEXT,
    "bankAccount" TEXT,
    "bankAccountName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_comm_logs" (
    "id" TEXT NOT NULL,
    "type" "CommType" NOT NULL,
    "direction" "CommDirection" NOT NULL DEFAULT 'OUTBOUND',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "participantId" TEXT,
    "providerId" TEXT,
    "userId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_comm_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_plans" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reviewDate" TIMESTAMP(3),
    "prodaPlanId" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_budget_lines" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "allocatedCents" INTEGER NOT NULL,
    "spentCents" INTEGER NOT NULL DEFAULT 0,
    "reservedCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_invoices" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "planId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotalCents" INTEGER NOT NULL,
    "gstCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "aiConfidence" DOUBLE PRECISION,
    "aiExtractedAt" TIMESTAMP(3),
    "aiRawData" JSONB,
    "s3Key" TEXT,
    "s3Bucket" TEXT,
    "status" "InvStatus" NOT NULL DEFAULT 'RECEIVED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "inv_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "budgetLineId" TEXT,
    "supportItemCode" TEXT NOT NULL,
    "supportItemName" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "gstCents" INTEGER NOT NULL DEFAULT 0,
    "isPriceGuideCompliant" BOOLEAN NOT NULL DEFAULT true,
    "priceGuideMaxCents" INTEGER,

    CONSTRAINT "inv_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clm_claims" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "prodaClaimId" TEXT,
    "prodaReference" TEXT,
    "claimedCents" INTEGER NOT NULL,
    "approvedCents" INTEGER NOT NULL DEFAULT 0,
    "status" "ClmStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "outcomeAt" TIMESTAMP(3),
    "outcomeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clm_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnk_payments" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "abaFileId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "bsb" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "reference" TEXT,
    "status" "BnkPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bnk_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnk_aba_files" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "paymentCount" INTEGER NOT NULL,
    "bankReference" TEXT,
    "submittedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bnk_aba_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_documents" (
    "id" TEXT NOT NULL,
    "participantId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Bucket" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "core_users_email_key" ON "core_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "core_accounts_provider_providerAccountId_key" ON "core_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "core_sessions_sessionToken_key" ON "core_sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "core_verification_tokens_token_key" ON "core_verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "core_verification_tokens_identifier_token_key" ON "core_verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "core_audit_logs_resource_resourceId_idx" ON "core_audit_logs"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "core_audit_logs_userId_idx" ON "core_audit_logs"("userId");

-- CreateIndex
CREATE INDEX "core_audit_logs_createdAt_idx" ON "core_audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "crm_participants_ndisNumber_key" ON "crm_participants"("ndisNumber");

-- CreateIndex
CREATE INDEX "crm_participants_ndisNumber_idx" ON "crm_participants"("ndisNumber");

-- CreateIndex
CREATE INDEX "crm_participants_assignedToId_idx" ON "crm_participants"("assignedToId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_providers_abn_key" ON "crm_providers"("abn");

-- CreateIndex
CREATE INDEX "crm_providers_abn_idx" ON "crm_providers"("abn");

-- CreateIndex
CREATE INDEX "crm_comm_logs_participantId_idx" ON "crm_comm_logs"("participantId");

-- CreateIndex
CREATE INDEX "crm_comm_logs_providerId_idx" ON "crm_comm_logs"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_plans_prodaPlanId_key" ON "plan_plans"("prodaPlanId");

-- CreateIndex
CREATE INDEX "plan_plans_participantId_idx" ON "plan_plans"("participantId");

-- CreateIndex
CREATE INDEX "plan_plans_status_idx" ON "plan_plans"("status");

-- CreateIndex
CREATE INDEX "plan_budget_lines_planId_idx" ON "plan_budget_lines"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_budget_lines_planId_categoryCode_key" ON "plan_budget_lines"("planId", "categoryCode");

-- CreateIndex
CREATE INDEX "inv_invoices_participantId_idx" ON "inv_invoices"("participantId");

-- CreateIndex
CREATE INDEX "inv_invoices_providerId_idx" ON "inv_invoices"("providerId");

-- CreateIndex
CREATE INDEX "inv_invoices_status_idx" ON "inv_invoices"("status");

-- CreateIndex
CREATE INDEX "inv_invoices_receivedAt_idx" ON "inv_invoices"("receivedAt");

-- CreateIndex
CREATE INDEX "inv_invoice_lines_invoiceId_idx" ON "inv_invoice_lines"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "clm_claims_prodaClaimId_key" ON "clm_claims"("prodaClaimId");

-- CreateIndex
CREATE INDEX "clm_claims_status_idx" ON "clm_claims"("status");

-- CreateIndex
CREATE INDEX "clm_claims_invoiceId_idx" ON "clm_claims"("invoiceId");

-- CreateIndex
CREATE INDEX "bnk_payments_status_idx" ON "bnk_payments"("status");

-- CreateIndex
CREATE INDEX "doc_documents_participantId_idx" ON "doc_documents"("participantId");

-- AddForeignKey
ALTER TABLE "core_accounts" ADD CONSTRAINT "core_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "core_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_sessions" ADD CONSTRAINT "core_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "core_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_audit_logs" ADD CONSTRAINT "core_audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_participants" ADD CONSTRAINT "crm_participants_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_comm_logs" ADD CONSTRAINT "crm_comm_logs_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_comm_logs" ADD CONSTRAINT "crm_comm_logs_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "crm_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_comm_logs" ADD CONSTRAINT "crm_comm_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_plans" ADD CONSTRAINT "plan_plans_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_budget_lines" ADD CONSTRAINT "plan_budget_lines_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_invoices" ADD CONSTRAINT "inv_invoices_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_invoices" ADD CONSTRAINT "inv_invoices_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "crm_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_invoices" ADD CONSTRAINT "inv_invoices_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_invoices" ADD CONSTRAINT "inv_invoices_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_invoices" ADD CONSTRAINT "inv_invoices_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_invoice_lines" ADD CONSTRAINT "inv_invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "inv_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_invoice_lines" ADD CONSTRAINT "inv_invoice_lines_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "plan_budget_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clm_claims" ADD CONSTRAINT "clm_claims_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "inv_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bnk_payments" ADD CONSTRAINT "bnk_payments_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "clm_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bnk_payments" ADD CONSTRAINT "bnk_payments_abaFileId_fkey" FOREIGN KEY ("abaFileId") REFERENCES "bnk_aba_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_documents" ADD CONSTRAINT "doc_documents_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
