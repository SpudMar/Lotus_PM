-- AlterTable
ALTER TABLE "crm_correspondence" ADD COLUMN "coordinatorId" TEXT;

-- CreateIndex
CREATE INDEX "crm_correspondence_coordinatorId_createdAt_idx" ON "crm_correspondence"("coordinatorId", "createdAt");

-- AddForeignKey
ALTER TABLE "crm_correspondence" ADD CONSTRAINT "crm_correspondence_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
