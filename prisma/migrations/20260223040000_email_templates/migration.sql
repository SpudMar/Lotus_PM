-- CreateEnum
CREATE TYPE "EmailTemplateType" AS ENUM ('WELCOME_PACK', 'SERVICE_AGREEMENT', 'INVOICE_NOTIFICATION', 'CLAIM_STATUS', 'BUDGET_REPORT', 'APPROVAL_REQUEST', 'CUSTOM');

-- CreateTable
CREATE TABLE "notif_email_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EmailTemplateType" NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT,
    "mergeFields" JSONB NOT NULL DEFAULT '[]',
    "fixedAttachmentIds" JSONB NOT NULL DEFAULT '[]',
    "supportsVariableAttachment" BOOLEAN NOT NULL DEFAULT false,
    "variableAttachmentDescription" TEXT,
    "includesFormLink" BOOLEAN NOT NULL DEFAULT false,
    "formLinkUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notif_email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notif_sent_emails" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "sesMessageId" TEXT,
    "status" "NotifStatus" NOT NULL,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "participantId" TEXT,
    "attachmentKeys" JSONB NOT NULL DEFAULT '[]',
    "triggeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notif_sent_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notif_email_templates_name_key" ON "notif_email_templates"("name");

-- CreateIndex
CREATE INDEX "notif_sent_emails_templateId_idx" ON "notif_sent_emails"("templateId");

-- CreateIndex
CREATE INDEX "notif_sent_emails_participantId_idx" ON "notif_sent_emails"("participantId");

-- CreateIndex
CREATE INDEX "notif_sent_emails_status_idx" ON "notif_sent_emails"("status");

-- CreateIndex
CREATE INDEX "notif_sent_emails_createdAt_idx" ON "notif_sent_emails"("createdAt");

-- AddForeignKey
ALTER TABLE "notif_email_templates" ADD CONSTRAINT "notif_email_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notif_sent_emails" ADD CONSTRAINT "notif_sent_emails_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notif_email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notif_sent_emails" ADD CONSTRAINT "notif_sent_emails_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
