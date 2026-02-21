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
import { TextractClient, StartDocumentTextDetectionCommand } from '@aws-sdk/client-textract'
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge'
import { simpleParser } from 'mailparser'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'

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
