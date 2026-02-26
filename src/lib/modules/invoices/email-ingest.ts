/**
 * Email Invoice Ingest — REQ-024
 *
 * Pipeline: SES inbound → S3 (.eml) → SQS → POST /api/email-ingest
 *   → fetch .eml from S3 → parse with mailparser → extract PDF attachment
 *   → upload PDF to invoices/<year>/<month>/<uuid>.pdf
 *   → start Textract async job
 *   → create draft InvInvoice (status RECEIVED)
 *   → emit EventBridge lotus-pm.invoices.email-received
 *   → write audit log
 *
 * REQ-011: All AWS calls target ap-southeast-2.
 * REQ-016: PDF uploaded with SSE-S3 (AES-256) encryption.
 * REQ-017: No PII stored in audit log.
 */

import { S3Client, GetObjectCommand, PutObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3'
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
  type Block,
} from '@aws-sdk/client-textract'
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge'
import { simpleParser } from 'mailparser'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { createFromEmailIngest } from '@/lib/modules/crm/correspondence'
import { sendTemplatedEmail, sendRawEmail } from '@/lib/modules/notifications/email-send'
import { autoMatchInvoice } from './auto-match'
import type { ExtractedInvoiceData } from './textract-extraction'
import { processInvoice } from './processing-engine'

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Well-known ID for the system service account used in automated audit log entries.
 * This user is created by migration 20260222000000_add_invoice_email_ingest_fields.
 * isActive = false prevents login.
 */
export const SYSTEM_USER_ID = 'clsystem0000000000000001'

// ── Zod schemas ───────────────────────────────────────────────────────────────

/**
 * The JSON payload delivered by SQS when SES writes a raw email to S3.
 * The SQS action in the SES receipt rule sends the S3 object location.
 */
export const sqsMessageSchema = z.object({
  bucket: z.string().min(1, 'bucket is required'),
  key: z.string().min(1, 'key is required'),
})

export type SqsMessage = z.infer<typeof sqsMessageSchema>

/**
 * Input schema for POST /api/email-ingest/textract-complete.
 * Called after a Textract job is known to be finished (by scheduler or SNS).
 */
export const textractCompleteSchema = z.object({
  jobId: z.string().min(1, 'jobId is required'),
  invoiceId: z.string().min(1, 'invoiceId is required'),
})

export type TextractCompleteInput = z.infer<typeof textractCompleteSchema>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedEmail {
  /** Whether at least one PDF attachment was found */
  hasPdf: boolean
  /** Raw PDF buffers for each PDF attachment found (first is used for Textract) */
  pdfBuffers: Buffer[]
  /** Sender's email address (from the From header) */
  senderEmail: string
  /** Email subject */
  subject: string
}

export interface EmailInvoiceDraftData {
  /** S3 key of the uploaded PDF (invoices/<year>/<month>/<uuid>.pdf) */
  pdfS3Key: string
  /** S3 bucket where the PDF is stored */
  pdfS3Bucket: string
  /** Sender email address (stored on the draft invoice) */
  sourceEmail: string
  /** Textract async job ID — used to poll for extraction results */
  textractJobId: string
  /** Email subject line — stored in CrmCorrespondence */
  emailSubject?: string
  /** Plain-text email body — stored in CrmCorrespondence (truncated to 5000 chars) */
  emailBody?: string
  /** Original filename of the PDF attachment */
  originalFilename?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeS3Client(): S3Client {
  return new S3Client({ region: process.env.AWS_REGION ?? 'ap-southeast-2' })
}

function makeTextractClient(): TextractClient {
  return new TextractClient({ region: process.env.AWS_REGION ?? 'ap-southeast-2' })
}

function makeEventBridgeClient(): EventBridgeClient {
  return new EventBridgeClient({ region: process.env.AWS_REGION ?? 'ap-southeast-2' })
}

/**
 * Convert an AWS SDK v3 streaming body to a Node.js Buffer.
 * Uses the async iterable protocol which works in the Node.js runtime.
 */
async function bodyToBuffer(body: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Fetch a raw .eml file from S3 and parse it with mailparser.
 * Returns the sender address, subject, and any PDF attachments found.
 */
export async function parseEmailFromS3(bucket: string, key: string): Promise<ParsedEmail> {
  const s3 = makeS3Client()
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))

  if (!response.Body) {
    throw new Error(`S3 object ${bucket}/${key} has no body`)
  }

  const rawBuffer = await bodyToBuffer(response.Body as AsyncIterable<Uint8Array>)
  const parsed = await simpleParser(rawBuffer)

  const senderEmail = parsed.from?.value[0]?.address ?? ''
  const subject = parsed.subject ?? ''

  const pdfAttachments = (parsed.attachments ?? []).filter(
    (att) =>
      att.contentType === 'application/pdf' ||
      (att.filename?.toLowerCase().endsWith('.pdf') ?? false)
  )

  return {
    hasPdf: pdfAttachments.length > 0,
    pdfBuffers: pdfAttachments.map((att) => att.content),
    senderEmail,
    subject,
  }
}

/**
 * Move a no-attachment .eml to the inbound/no-attachment/ prefix so it is
 * preserved for inspection but does not trigger SQS retries.
 */
export async function moveToNoAttachment(bucket: string, key: string): Promise<void> {
  const s3 = makeS3Client()
  const destKey = key.replace(/^inbound\//, 'inbound/no-attachment/')
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${key}`,
      Key: destKey,
    })
  )
}

/**
 * Upload a PDF buffer to the invoice storage bucket.
 * Key pattern: invoices/<year>/<month>/<uuid>.pdf
 * REQ-016: Server-side AES-256 encryption.
 */
export async function uploadPdfToS3(
  pdfBuffer: Buffer,
  targetBucket: string
): Promise<string> {
  const s3 = makeS3Client()
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const pdfKey = `invoices/${year}/${month}/${randomUUID()}.pdf`

  await s3.send(
    new PutObjectCommand({
      Bucket: targetBucket,
      Key: pdfKey,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      ServerSideEncryption: 'AES256',
    })
  )

  return pdfKey
}

/**
 * Start an async Textract document text detection job for an S3-hosted PDF.
 * Returns the Textract JobId for polling.
 */
export async function startTextractJob(bucket: string, key: string): Promise<string> {
  const textract = makeTextractClient()
  const result = await textract.send(
    new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: { Bucket: bucket, Name: key },
      },
    })
  )
  if (!result.JobId) {
    throw new Error('Textract did not return a JobId')
  }
  return result.JobId
}

/**
 * Create a draft InvInvoice record for an email-ingested PDF.
 * - status: RECEIVED
 * - invoiceNumber: 'PENDING' (updated after staff review)
 * - amounts: 0 (updated after Textract extraction + staff review)
 * - participantId / providerId: null (linked during review)
 *
 * Also emits EventBridge lotus-pm.invoices.email-received and writes audit log.
 */
export async function createEmailInvoiceDraft(
  data: EmailInvoiceDraftData
): Promise<{ id: string }> {
  const invoice = await prisma.invInvoice.create({
    data: {
      invoiceNumber: 'PENDING',
      invoiceDate: new Date(),
      subtotalCents: 0,
      gstCents: 0,
      totalCents: 0,
      status: 'RECEIVED',
      s3Key: data.pdfS3Key,
      s3Bucket: data.pdfS3Bucket,
      sourceEmail: data.sourceEmail,
      textractJobId: data.textractJobId,
      ingestSource: 'EMAIL',
    },
    select: { id: true },
  })

  // REQ-017: Audit log — no PII. sourceEmail omitted; ingestSource recorded.
  await createAuditLog({
    userId: SYSTEM_USER_ID,
    action: 'EMAIL_RECEIVED',
    resource: 'invoice',
    resourceId: invoice.id,
    after: { ingestSource: 'EMAIL', textractJobId: data.textractJobId },
  })

  // Create CrmCorrespondence EMAIL_INBOUND entry for the per-client timeline.
  // Participant/provider are not linked yet — resolved during triage.
  // Best-effort: do not fail the whole ingest if correspondence creation fails.
  try {
    await createFromEmailIngest({
      invoiceId: invoice.id,
      fromAddress: data.sourceEmail,
      subject: data.emailSubject ?? '',
      body: data.emailBody ?? '',
      metadata: {
        s3Key: data.pdfS3Key,
        originalFilename: data.originalFilename ?? null,
      },
    })
  } catch {
    // Non-blocking: correspondence log failure must not prevent invoice creation
  }

  // Emit EventBridge event so automation rules can react (e.g. notify staff)
  const eb = makeEventBridgeClient()
  await eb.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: process.env.EVENTBRIDGE_BUS_NAME ?? 'lotus-pm-events',
          Source: 'lotus-pm.invoices',
          DetailType: 'lotus-pm.invoices.email-received',
          Detail: JSON.stringify({
            invoiceId: invoice.id,
            ingestSource: 'EMAIL',
            receivedAt: new Date().toISOString(),
          }),
        },
      ],
    })
  )

  // Send acknowledgment to provider — best-effort, never blocks ingest
  sendInvoiceAcknowledgment(invoice.id, data.sourceEmail).catch((err) => {
    console.error('[email-ingest] acknowledgment send failed:', err)
  })

  return invoice
}

/**
 * Send an automated acknowledgment email to the provider when their invoice
 * is received. Best-effort — never throws (errors are logged, not propagated).
 *
 * Looks up the first active INVOICE_NOTIFICATION template. If none exists,
 * falls back to a hardcoded default HTML email.
 */
export async function sendInvoiceAcknowledgment(
  invoiceId: string,
  senderEmail: string
): Promise<void> {
  try {
    const portalUrl = `${process.env.NEXTAUTH_URL ?? 'https://planmanager.lotusassist.com.au'}/provider-portal/invoices`

    const template = await prisma.notifEmailTemplate.findFirst({
      where: { type: 'INVOICE_NOTIFICATION', isActive: true },
    })

    if (template) {
      await sendTemplatedEmail({
        templateId: template.id,
        recipientEmail: senderEmail,
        mergeFieldValues: {
          invoiceNumber: invoiceId,
          invoicePortalLink: portalUrl,
          companyName: 'Lotus Assist',
          companyPhone: '1800 645 809',
          today: new Date().toLocaleDateString('en-AU'),
        },
        triggeredById: SYSTEM_USER_ID,
      })
    } else {
      await sendRawEmail({
        to: senderEmail,
        subject: "We've received your invoice — Lotus Assist",
        htmlBody: buildAcknowledgmentHtml(invoiceId, portalUrl),
        triggeredById: SYSTEM_USER_ID,
      })
    }
  } catch (err) {
    console.error('[email-ingest] sendInvoiceAcknowledgment failed:', err)
  }
}

/**
 * Build the hardcoded fallback HTML body for the invoice acknowledgment email.
 * Used when no active INVOICE_NOTIFICATION template exists in the database.
 */
function buildAcknowledgmentHtml(invoiceId: string, portalUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice Received — Lotus Assist</title>
</head>
<body style="margin:0;padding:0;background-color:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#fafaf9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e7e5e4;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#292524;padding:32px 40px;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:600;letter-spacing:-0.3px;">Lotus Assist</p>
              <p style="margin:4px 0 0;color:#a8a29e;font-size:13px;">NDIS Plan Management</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;color:#292524;font-size:24px;font-weight:600;">Invoice Received</h1>
              <p style="margin:0 0 16px;color:#78716c;font-size:15px;line-height:1.6;">
                Thank you for submitting your invoice. We have received it and it is now being processed.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#fafaf9;border:1px solid #e7e5e4;border-radius:6px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;color:#78716c;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your Reference Number</p>
                    <p style="margin:0;color:#292524;font-size:15px;font-weight:600;font-family:monospace;">${invoiceId}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;color:#78716c;font-size:15px;line-height:1.6;">
                You can track the status of your invoice through the Lotus Assist provider portal.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:#292524;border-radius:6px;">
                    <a href="${portalUrl}" target="_blank" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Track My Invoice</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#78716c;font-size:14px;line-height:1.6;">
                Processing typically takes up to 10 business days. We will contact you if we need any additional information.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e7e5e4;background-color:#fafaf9;">
              <p style="margin:0 0 4px;color:#78716c;font-size:13px;font-weight:600;">Lotus Assist</p>
              <p style="margin:0;color:#a8a29e;font-size:13px;">Phone: 1800 645 809</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Textract result polling ────────────────────────────────────────────────────

/**
 * Thrown when a Textract job is still IN_PROGRESS or PARTIAL_SUCCESS.
 * The API route returns 202 Accepted so the caller can retry later.
 */
export class TextractJobPendingError extends Error {
  constructor(jobId: string, status: string) {
    super(`Textract job ${jobId} is not yet complete (status: ${status})`)
    this.name = 'TextractJobPendingError'
  }
}

/**
 * Fetch all pages of Textract GetDocumentTextDetection results for a job.
 * Handles NextToken pagination — a multi-page PDF may produce many pages of blocks.
 *
 * @throws TextractJobPendingError if the job is still IN_PROGRESS
 * @throws Error if the job has FAILED
 */
export async function pollTextractResult(jobId: string): Promise<Block[]> {
  const textract = makeTextractClient()
  const blocks: Block[] = []
  let nextToken: string | undefined

  do {
    const response = await textract.send(
      new GetDocumentTextDetectionCommand({
        JobId: jobId,
        ...(nextToken ? { NextToken: nextToken } : {}),
      })
    )

    const status = response.JobStatus ?? 'UNKNOWN'

    if (status === 'FAILED') {
      throw new Error(
        `Textract job ${jobId} failed: ${response.StatusMessage ?? 'unknown error'}`
      )
    }

    if (status !== 'SUCCEEDED') {
      throw new TextractJobPendingError(jobId, status)
    }

    for (const block of response.Blocks ?? []) {
      blocks.push(block)
    }
    nextToken = response.NextToken
  } while (nextToken)

  return blocks
}

// ── Apply extraction results to the draft invoice ─────────────────────────────

/**
 * Update a draft InvInvoice with data extracted from Textract blocks:
 * - Populates invoiceNumber, invoiceDate, subtotalCents, gstCents, totalCents
 *   (only fields that were successfully extracted; unextracted fields stay as-is)
 * - Creates InvInvoiceLine records for each detected NDIS support item
 * - Links provider by ABN if found in DB
 * - Sets status → PENDING_REVIEW (ready for human review)
 * - Sets aiExtractedAt, aiConfidence, aiRawData
 * - Writes TEXTRACT_COMPLETE audit log entry
 * - Emits lotus-pm.invoices.extraction-complete EventBridge event
 *
 * Safe to call on a draft with no existing lines (email-ingested invoices
 * start with zero lines). Existing lines are cleared before new ones are added.
 */
export async function applyExtractionToInvoice(
  invoiceId: string,
  extracted: ExtractedInvoiceData
) {
  // Attempt provider lookup by ABN — best-effort, not required
  let resolvedProviderId: string | undefined
  if (extracted.providerAbn) {
    const abn = extracted.providerAbn // Normalized: no spaces
    const abnSpaced = abn.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4')
    const found = await prisma.crmProvider.findFirst({
      where: { deletedAt: null, OR: [{ abn }, { abn: abnSpaced }] },
      select: { id: true },
    })
    if (found) resolvedProviderId = found.id
  }

  // Run auto-match service for email/domain/historical/NDIS-number based matching.
  // Fetch sourceEmail from the draft invoice so we can pass it to the matcher.
  const draft = await prisma.invInvoice.findFirst({
    where: { id: invoiceId },
    select: { sourceEmail: true },
  })
  const autoMatch = await autoMatchInvoice(extracted, draft?.sourceEmail ?? null)

  // Provider: prefer ABN lookup (already resolved above), fall back to auto-match
  const finalProviderId = resolvedProviderId ?? autoMatch.providerId ?? undefined
  // Participant: always from auto-match (ABN lookup doesn't handle participants)
  const finalParticipantId = autoMatch.participantId ?? undefined
  // Match metadata: use auto-match result (covers ABN_EXACT and all other methods)
  const hasMatch = finalProviderId !== undefined || finalParticipantId !== undefined

  // Clear any auto-generated placeholder lines before creating extraction results.
  // Email-ingested drafts start with no lines, so this is a no-op in practice.
  // Guard: we only delete lines on invoices that have no linked claim lines,
  // which is guaranteed for status RECEIVED drafts.
  await prisma.invInvoiceLine.deleteMany({ where: { invoiceId } })

  // Create one InvInvoiceLine per detected NDIS line item
  for (const item of extracted.lineItems) {
    await prisma.invInvoiceLine.create({
      data: {
        invoiceId,
        supportItemCode: item.supportItemCode,
        supportItemName: item.supportItemName,
        categoryCode: item.categoryCode,
        serviceDate: item.serviceDate,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
        gstCents: item.gstCents,
      },
    })
  }

  // Build the invoice update — only overwrite fields we actually extracted
  const invoice = await prisma.invInvoice.update({
    where: { id: invoiceId },
    data: {
      status: 'PENDING_REVIEW',
      aiExtractedAt: new Date(),
      aiConfidence: extracted.confidence,
      // Store a structured extraction summary (not raw blocks — too large)
      aiRawData: {
        source: 'textract',
        extractedAt: new Date().toISOString(),
        invoiceNumber: extracted.invoiceNumber,
        invoiceDate: extracted.invoiceDate?.toISOString() ?? null,
        totalCents: extracted.totalCents,
        gstCents: extracted.gstCents,
        subtotalCents: extracted.subtotalCents,
        providerAbn: extracted.providerAbn,
        lineItemCount: extracted.lineItems.length,
        confidence: extracted.confidence,
      },
      // Only update the fields we actually extracted
      ...(extracted.invoiceNumber !== null
        ? { invoiceNumber: extracted.invoiceNumber }
        : {}),
      ...(extracted.invoiceDate !== null
        ? { invoiceDate: extracted.invoiceDate }
        : {}),
      ...(extracted.totalCents !== null ? { totalCents: extracted.totalCents } : {}),
      ...(extracted.gstCents !== null ? { gstCents: extracted.gstCents } : {}),
      ...(extracted.subtotalCents !== null
        ? { subtotalCents: extracted.subtotalCents }
        : {}),
      ...(finalProviderId !== undefined ? { providerId: finalProviderId } : {}),
      ...(finalParticipantId !== undefined ? { participantId: finalParticipantId } : {}),
      ...(hasMatch
        ? {
            matchMethod: autoMatch.matchMethod,
            matchConfidence: autoMatch.matchConfidence,
          }
        : {}),
    },
  })

  // REQ-017: Audit log — no PII
  await createAuditLog({
    userId: SYSTEM_USER_ID,
    action: 'TEXTRACT_COMPLETE',
    resource: 'invoice',
    resourceId: invoiceId,
    after: {
      status: 'PENDING_REVIEW',
      invoiceNumber: extracted.invoiceNumber,
      lineItemCount: extracted.lineItems.length,
      confidence: extracted.confidence,
      matchMethod: hasMatch ? autoMatch.matchMethod : null,
      matchConfidence: hasMatch ? autoMatch.matchConfidence : null,
    },
  })

  // Emit EventBridge so automation rules can react (e.g. notify staff to review)
  const eb = makeEventBridgeClient()
  await eb.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: process.env.EVENTBRIDGE_BUS_NAME ?? 'lotus-pm-events',
          Source: 'lotus-pm.invoices',
          DetailType: 'lotus-pm.invoices.extraction-complete',
          Detail: JSON.stringify({
            invoiceId,
            confidence: extracted.confidence,
            lineItemCount: extracted.lineItems.length,
            status: 'PENDING_REVIEW',
            extractedAt: new Date().toISOString(),
          }),
        },
      ],
    })
  )

  // Trigger AI processing engine (Wave 1)
  // Fire-and-forget with error handling — never block email ingest on AI failure
  processInvoice(invoice.id).catch((err) => {
    console.error('[email-ingest] processInvoice failed, invoice left PENDING_REVIEW:', err)
  })

  return invoice
}
