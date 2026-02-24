-- Invoice Processing Engine -- Wave 1
-- Adds AI processing fields to InvInvoice and per-line AI/validation fields to InvInvoiceLine.

-- InvInvoice: AI processing result fields
ALTER TABLE "inv_invoices" ADD COLUMN "processing_category" TEXT;
ALTER TABLE "inv_invoices" ADD COLUMN "ai_processing_result" JSONB;
ALTER TABLE "inv_invoices" ADD COLUMN "processed_at" TIMESTAMP(3);

-- Index for processing category queries (dashboard, routing)
CREATE INDEX "inv_invoices_processing_category_idx" ON "inv_invoices"("processing_category");

-- InvInvoiceLine: AI suggestion fields (separate from WS-F4 pattern-learning fields)
ALTER TABLE "inv_invoice_lines" ADD COLUMN "ai_suggested_code" TEXT;
ALTER TABLE "inv_invoice_lines" ADD COLUMN "ai_code_confidence" TEXT;
ALTER TABLE "inv_invoice_lines" ADD COLUMN "ai_code_reasoning" TEXT;

-- InvInvoiceLine: per-line validation fields
ALTER TABLE "inv_invoice_lines" ADD COLUMN "validation_status" TEXT DEFAULT 'PENDING';
ALTER TABLE "inv_invoice_lines" ADD COLUMN "validation_notes" JSONB;
ALTER TABLE "inv_invoice_lines" ADD COLUMN "price_cap_cents" INTEGER;

-- InvInvoiceLine: per-line decision fields (for Wave 3 partial approve/reject)
ALTER TABLE "inv_invoice_lines" ADD COLUMN "line_status" TEXT DEFAULT 'PENDING';
ALTER TABLE "inv_invoice_lines" ADD COLUMN "rejection_reason" TEXT;
ALTER TABLE "inv_invoice_lines" ADD COLUMN "adjusted_amount_cents" INTEGER;
