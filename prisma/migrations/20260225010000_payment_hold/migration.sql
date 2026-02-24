-- Payment Hold
ALTER TYPE "BnkPaymentStatus" ADD VALUE 'ON_HOLD';
ALTER TABLE "bnk_payments" ADD COLUMN "hold_reason" TEXT;
ALTER TABLE "bnk_payments" ADD COLUMN "held_at" TIMESTAMP(3);
