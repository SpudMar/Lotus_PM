/**
 * POST /api/webhooks/m365-ingest
 *
 * Receives emails forwarded from Microsoft 365 via Power Automate HTTP action.
 * This replaces SES email receipt for the testing phase — the M365 inbox stays on
 * Microsoft 365, Power Automate fires a copy of each inbound email to this endpoint.
 *
 * Authentication: X-Webhook-Secret header must match process.env.M365_WEBHOOK_SECRET.
 * This is a server-to-server webhook — NOT a NextAuth-protected route.
 *
 * For each PDF attachment:
 *   1. Decode base64 contentBytes
 *   2. Upload to S3 under email-ingest/{messageId|uuid}/{filename}
 *   3. Start an async Textract job (reusing existing startTextractJob)
 *   4. Create a draft InvInvoice (reusing existing createEmailInvoiceDraft)
 *
 * For the email itself:
 *   - Create a CrmCorrespondence EMAIL_INBOUND record (always, even with no PDF)
 *
 * REQ-024: Email invoice ingestion pipeline.
 * REQ-011: All AWS operations use ap-southeast-2.
 * REQ-016: PDFs uploaded with SSE-S3 (AES-256) encryption.
 * REQ-017: No PII in audit logs.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z, ZodError } from 'zod'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'
import { startTextractJob, createEmailInvoiceDraft } from '@/lib/modules/invoices/email-ingest'
import type { Prisma } from '@prisma/client'

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.M365_WEBHOOK_SECRET
  // If env var is not set, all requests are rejected (no fallback)
  if (!secret || secret.length === 0) return false

  const provided = request.headers.get('x-webhook-secret') ?? ''
  return provided === secret
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const attachmentSchema = z.object({
  name: z.string().min(1),
  contentType: z.string().min(1),
  contentBytes: z.string().min(1),
})

/**
 * Power Automate HTTP action body schema.
 * All fields are optional except `from` (the sender address).
 */
export const m365IngestSchema = z.object({
  subject: z.string().optional(),
  from: z.string().min(1, 'from is required'),
  fromName: z.string().optional(),
  to: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  receivedAt: z.string().optional(),
  messageId: z.string().optional(),
  attachments: z.array(attachmentSchema).optional().default([]),
})

export type M365IngestInput = z.infer<typeof m365IngestSchema>

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeS3Client(): S3Client {
  return new S3Client({ region: process.env.AWS_REGION ?? 'ap-southeast-2' })
}

function getInvoiceBucket(): string {
  return (
    process.env.S3_BUCKET_INVOICES ??
    process.env.AWS_S3_BUCKET ??
    'lotus-pm-invoices-staging-147899847719'
  )
}

/**
 * Strip HTML tags from a string for plain-text fallback.
 * Handles the common case — not a full HTML parser.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Upload a decoded PDF buffer to S3.
 * Key pattern: email-ingest/{messageId|uuid}/{sanitised-filename}
 * REQ-016: Server-side AES-256 encryption.
 */
async function uploadAttachmentToS3(params: {
  buffer: Buffer
  filename: string
  contentType: string
  messageId: string
  bucket: string
}): Promise<string> {
  const s3 = makeS3Client()
  // Sanitise filename: strip path traversal, collapse whitespace
  const safe = params.filename.replace(/[/\\]/g, '_').replace(/\s+/g, '_')
  const key = `email-ingest/${params.messageId}/${safe}`

  await s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: key,
      Body: params.buffer,
      ContentType: params.contentType,
      ServerSideEncryption: 'AES256',
    })
  )

  return key
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth check — X-Webhook-Secret header
  if (!isAuthorised(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  try {
    // 2. Parse + validate body
    const raw = await request.json() as unknown
    const input = m365IngestSchema.parse(raw)

    const bucket = getInvoiceBucket()
    // Use messageId from payload as the folder key; fall back to a fresh UUID
    const folderKey = input.messageId ?? randomUUID()

    // 3. Process PDF attachments
    const s3Keys: string[] = []

    const pdfAttachments = (input.attachments ?? []).filter(
      (att) =>
        att.contentType === 'application/pdf' ||
        att.name.toLowerCase().endsWith('.pdf')
    )

    for (const attachment of pdfAttachments) {
      // 3a. Decode base64 content
      const buffer = Buffer.from(attachment.contentBytes, 'base64')

      // 3b. Upload to S3
      const s3Key = await uploadAttachmentToS3({
        buffer,
        filename: attachment.name,
        contentType: attachment.contentType,
        messageId: folderKey,
        bucket,
      })
      s3Keys.push(s3Key)

      // 3c. Start Textract + create draft invoice (reuses the existing SES pipeline)
      const textractJobId = await startTextractJob(bucket, s3Key)

      await createEmailInvoiceDraft({
        pdfS3Key: s3Key,
        pdfS3Bucket: bucket,
        sourceEmail: input.from,
        textractJobId,
        emailSubject: input.subject,
        emailBody: input.bodyText ?? (input.bodyHtml ? stripHtml(input.bodyHtml) : ''),
        originalFilename: attachment.name,
      })
    }

    // 4. Resolve body text (strip HTML if plain text not provided)
    const MAX_BODY_CHARS = 5000
    const bodyText = (
      input.bodyText ??
      (input.bodyHtml ? stripHtml(input.bodyHtml) : '')
    ).slice(0, MAX_BODY_CHARS)

    // 4. Create CrmCorrespondence EMAIL_INBOUND record for the email itself.
    // Participant and provider left null — resolved during triage (same as SES pipeline).
    const correspondence = await prisma.crmCorrespondence.create({
      data: {
        type: 'EMAIL_INBOUND',
        subject: input.subject,
        body: bodyText,
        fromAddress: input.from,
        toAddress: input.to,
        // participantId / providerId / invoiceId left null — set during triage
        // createdById null = system/automation action (no staff user)
        metadata: {
          messageId: input.messageId ?? null,
          fromName: input.fromName ?? null,
          receivedAt: input.receivedAt ?? null,
          source: 'm365-webhook',
          attachmentCount: input.attachments?.length ?? 0,
          s3Keys,
        } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    })

    // 5. Return receipt confirmation
    return NextResponse.json(
      {
        received: true,
        correspondenceId: correspondence.id,
        s3Keys,
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

    // Log without PII — just the error message (REQ-017)
    console.error(
      '[m365-ingest] Unhandled error:',
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
