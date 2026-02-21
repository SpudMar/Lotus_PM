-- CreateTable: Provider email lookup for auto-matching
CREATE TABLE "crm_provider_emails" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_provider_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique email (one email → one provider)
CREATE UNIQUE INDEX "crm_provider_emails_email_key" ON "crm_provider_emails"("email");

-- CreateIndex: provider lookup
CREATE INDEX "crm_provider_emails_providerId_idx" ON "crm_provider_emails"("providerId");

-- AddForeignKey
ALTER TABLE "crm_provider_emails" ADD CONSTRAINT "crm_provider_emails_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "crm_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add auto-matching fields to inv_invoices
ALTER TABLE "inv_invoices" ADD COLUMN "matchConfidence" DOUBLE PRECISION;
ALTER TABLE "inv_invoices" ADD COLUMN "matchMethod" TEXT;
