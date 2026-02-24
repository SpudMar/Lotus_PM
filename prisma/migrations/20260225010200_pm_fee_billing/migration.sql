-- CreateEnum
CREATE TYPE "PmFeeFrequency" AS ENUM ('MONTHLY', 'PER_INVOICE', 'ONE_OFF');

-- CreateEnum
CREATE TYPE "PmFeeChargeStatus" AS ENUM ('PENDING', 'CLAIMED', 'PAID', 'WAIVED');

-- CreateTable
CREATE TABLE "pm_fee_schedules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "supportItemCode" TEXT NOT NULL,
    "description" TEXT,
    "rateCents" INTEGER NOT NULL,
    "frequency" "PmFeeFrequency" NOT NULL DEFAULT 'MONTHLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pm_fee_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_fee_overrides" (
    "id" TEXT NOT NULL,
    "feeScheduleId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "rateCents" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pm_fee_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_fee_charges" (
    "id" TEXT NOT NULL,
    "feeScheduleId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PmFeeChargeStatus" NOT NULL DEFAULT 'PENDING',
    "claimId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pm_fee_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pm_fee_overrides_feeScheduleId_participantId_key" ON "pm_fee_overrides"("feeScheduleId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "pm_fee_charges_feeScheduleId_participantId_periodStart_key" ON "pm_fee_charges"("feeScheduleId", "participantId", "periodStart");

-- AddForeignKey
ALTER TABLE "pm_fee_overrides" ADD CONSTRAINT "pm_fee_overrides_feeScheduleId_fkey" FOREIGN KEY ("feeScheduleId") REFERENCES "pm_fee_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_fee_overrides" ADD CONSTRAINT "pm_fee_overrides_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_fee_charges" ADD CONSTRAINT "pm_fee_charges_feeScheduleId_fkey" FOREIGN KEY ("feeScheduleId") REFERENCES "pm_fee_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_fee_charges" ADD CONSTRAINT "pm_fee_charges_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "crm_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
