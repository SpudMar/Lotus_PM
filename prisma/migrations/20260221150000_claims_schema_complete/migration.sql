-- Migration: claims_schema_complete
-- Updates schema.prisma to match DB state from 20260221000000_phase2 migration.
-- The clm_batches, clm_claim_lines, and clm_claims new columns already exist.
-- This migration adds in-app read/dismiss tracking to notif_notifications.

ALTER TABLE "notif_notifications"
  ADD COLUMN IF NOT EXISTS "userId"      TEXT,
  ADD COLUMN IF NOT EXISTS "readAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dismissedAt" TIMESTAMP(3);

DO $$ BEGIN
  CREATE INDEX "notif_notifications_userId_readAt_idx" ON "notif_notifications"("userId", "readAt");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "notif_notifications"
    ADD CONSTRAINT "notif_notifications_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
