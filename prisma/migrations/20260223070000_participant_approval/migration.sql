-- Migration: 20260223070000_participant_approval
-- WS7: Participant invoice approval flow with JWT tokens

-- CreateEnum: ApprovalMethod
CREATE TYPE "ApprovalMethod" AS ENUM ('APP', 'EMAIL', 'SMS');

-- CreateEnum: ParticipantApprovalStatus
CREATE TYPE "ParticipantApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED', 'NOT_REQUIRED');

-- AlterEnum: Add PENDING_PARTICIPANT_APPROVAL to InvStatus
ALTER TYPE "InvStatus" ADD VALUE 'PENDING_PARTICIPANT_APPROVAL';

-- AlterTable: Add approval fields to crm_participants
ALTER TABLE "crm_participants"
  ADD COLUMN "invoiceApprovalEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "invoiceApprovalMethod" "ApprovalMethod";

-- AlterTable: Add approval fields to inv_invoices
ALTER TABLE "inv_invoices"
  ADD COLUMN "participantApprovalStatus" "ParticipantApprovalStatus",
  ADD COLUMN "participantApprovedAt" TIMESTAMP(3),
  ADD COLUMN "approvalTokenHash" TEXT,
  ADD COLUMN "approvalTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "approvalSentAt" TIMESTAMP(3),
  ADD COLUMN "approvalSkippedAt" TIMESTAMP(3);
