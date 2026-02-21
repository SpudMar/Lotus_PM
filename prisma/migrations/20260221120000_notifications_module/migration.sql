-- AlterTable: Add phone field to core_users
ALTER TABLE "core_users" ADD COLUMN "phone" TEXT;

-- CreateEnum
CREATE TYPE "NotifChannel" AS ENUM ('SMS', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotifStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DELIVERED', 'UNDELIVERED');

-- CreateTable
CREATE TABLE "notif_notifications" (
    "id" TEXT NOT NULL,
    "channel" "NotifChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "status" "NotifStatus" NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "participantId" TEXT,
    "triggeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notif_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notif_notifications_channel_status_idx" ON "notif_notifications"("channel", "status");

-- CreateIndex
CREATE INDEX "notif_notifications_participantId_idx" ON "notif_notifications"("participantId");

-- CreateIndex
CREATE INDEX "notif_notifications_createdAt_idx" ON "notif_notifications"("createdAt");

-- AddForeignKey
ALTER TABLE "notif_notifications" ADD CONSTRAINT "notif_notifications_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
