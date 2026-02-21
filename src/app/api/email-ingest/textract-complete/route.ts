/**
 * POST /api/email-ingest/textract-complete
 *
 * Called by the SQS worker (or a scheduler) after a Textract job is finished.
 * Uses the same Bearer token auth as POST /api/email-ingest — not a user session.
 *
 * Input body (Zod-validated):
 *   { jobId: string, invoiceId: string }
 *
 * Steps:
 *   1. Fetch all Textract result pages (GetDocumentTextDetection + NextToken)
 *   2. Run NDIS extraction heuristics on the LINE blocks
 *   3. Update the draft InvInvoice in DB → status PENDING_REVIEW
 *   4. Emit lotus-pm.invoices.extraction-complete EventBridge event
 *   5. Write TEXTRACT_COMPLETE audit log entry
 *
 * Response codes:
 *   200 — extraction applied, invoice ready for staff review
 *   202 — Textract job still IN_PROGRESS; caller should retry later
 *   400 — validation error (bad body)
 *   401 — missing or wrong Bearer token
 *   500 — unexpected error
 */

import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import {
  textractCompleteSchema,
  pollTextractResult,
  applyExtractionToInvoice,
  TextractJobPendingError,
} from '@/lib/modules/invoices/email-ingest'
import { extractInvoiceData } from '@/lib/modules/invoices/textract-extraction'

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.EMAIL_INGEST_SECRET ?? ''
  if (secret.length === 0) return false
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  return token === secret
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorised(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json() as unknown
    const { jobId, invoiceId } = textractCompleteSchema.parse(body)

    // 1. Fetch all Textract result pages
    let blocks
    try {
      blocks = await pollTextractResult(jobId)
    } catch (err) {
      if (err instanceof TextractJobPendingError) {
        return NextResponse.json(
          { message: 'Textract job still in progress — retry later', code: 'JOB_PENDING' },
          { status: 202 }
        )
      }
      throw err
    }

    // 2. Run NDIS extraction heuristics
    const extracted = extractInvoiceData(blocks)

    // 3–5. Update DB, emit event, write audit log
    const invoice = await applyExtractionToInvoice(invoiceId, extracted)

    return NextResponse.json(
      {
        invoiceId: invoice.id,
        status: invoice.status,
        invoiceNumber: invoice.invoiceNumber,
        confidence: invoice.aiConfidence,
        lineItemCount: extracted.lineItems.length,
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      )
    }
    console.error(
      '[textract-complete] Unhandled error:',
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
