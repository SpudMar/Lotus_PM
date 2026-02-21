/**
 * POST /api/email-ingest
 *
 * Internal endpoint called by the SQS worker when SES delivers an inbound email.
 * Authentication is via a pre-shared Bearer token (EMAIL_INGEST_SECRET env var),
 * NOT a user session — this route is never called by browser clients.
 *
 * Expected body (SQS message payload):
 *   { bucket: string, key: string }
 *
 * Returns 200 for all handled outcomes (including no-PDF) to suppress SQS retries.
 * Returns 400 for malformed payloads (let SQS retry or move to DLQ).
 * Returns 401 for invalid/missing auth token.
 * Returns 500 for unexpected errors.
 *
 * REQ-024: Email invoice ingestion pipeline.
 * REQ-011: All AWS operations use ap-southeast-2 (configured in module).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import {
  sqsMessageSchema,
  parseEmailFromS3,
  moveToNoAttachment,
  uploadPdfToS3,
  startTextractJob,
  createEmailInvoiceDraft,
} from '@/lib/modules/invoices/email-ingest'

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
    const { bucket, key } = sqsMessageSchema.parse(body)

    // 1. Fetch and parse the .eml from S3
    const { hasPdf, pdfBuffers, senderEmail } = await parseEmailFromS3(bucket, key)

    // 2. No PDF attachment — move to no-attachment prefix, return 200 (no retry)
    if (!hasPdf) {
      await moveToNoAttachment(bucket, key)
      return NextResponse.json(
        { message: 'No PDF attachment — email moved to inbound/no-attachment/' },
        { status: 200 }
      )
    }

    // 3. Upload the first PDF to the invoice bucket
    const invoiceBucket = process.env.S3_BUCKET_INVOICES ?? bucket
    const pdfS3Key = await uploadPdfToS3(pdfBuffers[0]!, invoiceBucket)

    // 4. Start async Textract job
    const textractJobId = await startTextractJob(invoiceBucket, pdfS3Key)

    // 5. Create draft invoice in DB + emit EventBridge event + audit log
    const invoice = await createEmailInvoiceDraft({
      pdfS3Key,
      pdfS3Bucket: invoiceBucket,
      sourceEmail: senderEmail,
      textractJobId,
    })

    return NextResponse.json(
      { invoiceId: invoice.id, textractJobId },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      )
    }
    // Log without PII — just the error message (REQ-017)
    console.error(
      '[email-ingest] Unhandled error:',
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
