-- AlterTable: add sourceInvoiceId to clm_claim_lines for batch-generated claims
ALTER TABLE "clm_claim_lines" ADD COLUMN "sourceInvoiceId" TEXT;
