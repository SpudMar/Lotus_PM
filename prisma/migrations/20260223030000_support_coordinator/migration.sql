-- NOTE: SUPPORT_COORDINATOR already in CoreRole enum — no ALTER TYPE needed
-- (enum values already added in earlier session)

-- CreateTable
CREATE TABLE "crm_coordinator_assignments" (
    "id" TEXT NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "organisation" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_coordinator_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_coordinator_assignments_coordinatorId_participantId_key" ON "crm_coordinator_assignments"("coordinatorId", "participantId");

-- AddForeignKey
ALTER TABLE "crm_coordinator_assignments" ADD CONSTRAINT "crm_coordinator_assignments_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_coordinator_assignments" ADD CONSTRAINT "crm_coordinator_assignments_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_coordinator_assignments" ADD CONSTRAINT "crm_coordinator_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
