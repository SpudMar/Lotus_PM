-- CreateEnum
CREATE TYPE "FlagSeverity" AS ENUM ('ADVISORY', 'BLOCKING');

-- CreateTable
CREATE TABLE "crm_flags" (
    "id" TEXT NOT NULL,
    "severity" "FlagSeverity" NOT NULL DEFAULT 'ADVISORY',
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "participantId" TEXT,
    "providerId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolveNote" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_flags_participantId_resolvedAt_idx" ON "crm_flags"("participantId", "resolvedAt");

-- CreateIndex
CREATE INDEX "crm_flags_providerId_resolvedAt_idx" ON "crm_flags"("providerId", "resolvedAt");

-- AddForeignKey
ALTER TABLE "crm_flags" ADD CONSTRAINT "crm_flags_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_flags" ADD CONSTRAINT "crm_flags_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_flags" ADD CONSTRAINT "crm_flags_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "crm_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_flags" ADD CONSTRAINT "crm_flags_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "core_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
