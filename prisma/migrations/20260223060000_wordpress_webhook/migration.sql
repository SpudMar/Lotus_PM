-- Migration: 20260223060000_wordpress_webhook
-- WS6: Add onboardingStatus + ingestSource to CrmParticipant for WordPress webhook ingest.
-- Also make SaServiceAgreement.providerId optional (nullable) to support DRAFT SAs without a provider.

-- CreateEnum
CREATE TYPE "ParticipantOnboardingStatus" AS ENUM ('DRAFT', 'PENDING_PLAN', 'COMPLETE');

-- CreateEnum
CREATE TYPE "CrmIngestSource" AS ENUM ('MANUAL', 'WORDPRESS', 'API');

-- AlterTable: add onboarding fields to participants
ALTER TABLE "crm_participants" ADD COLUMN "onboardingStatus" "ParticipantOnboardingStatus",
                               ADD COLUMN "ingestSource" "CrmIngestSource";

-- AlterTable: make providerId optional on service agreements (WordPress SAs may not have a provider yet)
ALTER TABLE "sa_service_agreements" ALTER COLUMN "providerId" DROP NOT NULL;
