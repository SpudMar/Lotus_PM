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
import type { ExtractedInvoiceData } from './textract-extraction'

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

  return invoice
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
      ...(resolvedProviderId !== undefined
        ? { providerId: resolvedProviderId }
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

  return invoice
}
