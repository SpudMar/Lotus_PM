-- CreateEnum
CREATE TYPE "CorrespondenceType" AS ENUM ('EMAIL_INBOUND', 'EMAIL_OUTBOUND', 'SMS_INBOUND', 'SMS_OUTBOUND', 'NOTE', 'PHONE_CALL');

-- CreateTable
CREATE TABLE "crm_correspondence" (
    "id" TEXT NOT NULL,
    "type" "CorrespondenceType" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "participantId" TEXT,
    "providerId" TEXT,
    "invoiceId" TEXT,
    "documentId" TEXT,
    "createdById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_correspondence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_correspondence_participantId_createdAt_idx" ON "crm_correspondence"("participantId", "createdAt");

-- CreateIndex
CREATE INDEX "crm_correspondence_providerId_createdAt_idx" ON "crm_correspondence"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "crm_correspondence_invoiceId_idx" ON "crm_correspondence"("invoiceId");

-- AddForeignKey
ALTER TABLE "crm_correspondence" ADD CONSTRAINT "crm_correspondence_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_correspondence" ADD CONSTRAINT "crm_correspondence_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "crm_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_correspondence" ADD CONSTRAINT "crm_correspondence_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "inv_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_correspondence" ADD CONSTRAINT "crm_correspondence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
