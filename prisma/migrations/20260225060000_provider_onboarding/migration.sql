-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('DRAFT', 'INVITED', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED');

-- AlterTable: Add provider onboarding fields
-- bankBsb, bankAccount, bankAccountName already exist in crm_providers from init migration
ALTER TABLE "crm_providers" ADD COLUMN "providerStatus" "ProviderStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "crm_providers" ADD COLUMN "inviteToken" TEXT UNIQUE;
ALTER TABLE "crm_providers" ADD COLUMN "inviteExpiresAt" TIMESTAMP(3);
ALTER TABLE "crm_providers" ADD COLUMN "portalUserId" TEXT UNIQUE;
ALTER TABLE "crm_providers" ADD COLUMN "abnStatus" TEXT;
ALTER TABLE "crm_providers" ADD COLUMN "abnRegisteredName" TEXT;
ALTER TABLE "crm_providers" ADD COLUMN "gstRegistered" BOOLEAN;
