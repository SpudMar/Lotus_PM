-- AlterTable: Add batchId to BnkPayment
ALTER TABLE "bnk_payments" ADD COLUMN "batchId" TEXT;

-- AlterTable: Add batchId to BnkAbaFile
ALTER TABLE "bnk_aba_files" ADD COLUMN "batchId" TEXT;

-- CreateTable: BnkPaymentBatch
CREATE TABLE "bnk_payment_batches" (
    "id" TEXT NOT NULL,
    "description" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "bnk_payment_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bnk_payment_batches_createdAt_idx" ON "bnk_payment_batches"("createdAt");

-- CreateIndex
CREATE INDEX "bnk_payment_batches_createdById_idx" ON "bnk_payment_batches"("createdById");

-- AddForeignKey
ALTER TABLE "bnk_payment_batches" ADD CONSTRAINT "bnk_payment_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bnk_payments" ADD CONSTRAINT "bnk_payments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "bnk_payment_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bnk_aba_files" ADD CONSTRAINT "bnk_aba_files_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "bnk_payment_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
