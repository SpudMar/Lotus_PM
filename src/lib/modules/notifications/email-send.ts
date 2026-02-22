/**
 * Email sending module — templated and raw email sends via AWS SES.
 * REQ-032: Merge fields, fixed/variable attachments, form links.
 * REQ-010: All sent email records retained (NotifSentEmail).
 *
 * All sends are recorded in notif_sent_emails for audit and tracing.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { prisma } from '@/lib/db'
import { sendSesEmail } from './ses-client'
import { interpolateTemplate } from './email-templates'
import type { NotifSentEmail } from '@prisma/client'
import type { SesAttachment } from './ses-client'

// ─── S3 client (reuse singleton pattern from storage module) ──────────────

let _s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      region: process.env['AWS_REGION'] ?? 'ap-southeast-2',
    })
  }
  return _s3Client
}

function getBucket(): string {
  const bucket = process.env['AWS_S3_BUCKET']
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET environment variable is not set')
  }
  return bucket
}

// ─── S3 download helper ───────────────────────────────────────────────────

/**
 * Download an object from S3 and return it as a Buffer.
 */
async function downloadFromS3(s3Key: string, bucket?: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: bucket ?? getBucket(),
    Key: s3Key,
  })
  const response = await getS3Client().send(command)
  if (!response.Body) {
    throw new Error(`S3 object not found or empty: ${s3Key}`)
  }
  // Transform the stream to a Buffer
  const chunks: Uint8Array[] = []
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

// ─── Resolve document attachments ─────────────────────────────────────────

interface ResolvedAttachment {
  filename: string
  content: Buffer
  contentType: string
  s3Key: string
}

/**
 * Look up DocDocument records by ID and download from S3.
 * Used to resolve fixedAttachmentIds on a template.
 */
async function resolveDocumentAttachments(documentIds: string[]): Promise<ResolvedAttachment[]> {
  if (documentIds.length === 0) return []

  const documents = await prisma.docDocument.findMany({
    where: { id: { in: documentIds }, deletedAt: null },
    select: { id: true, name: true, mimeType: true, s3Key: true, s3Bucket: true },
  })

  return Promise.all(
    documents.map(async (doc) => {
      const content = await downloadFromS3(doc.s3Key, doc.s3Bucket)
      return {
        filename: doc.name,
        content,
        contentType: doc.mimeType,
        s3Key: doc.s3Key,
      }
    })
  )
}

// ─── Templated email send ─────────────────────────────────────────────────

export interface SendTemplatedEmailOptions {
  templateId: string
  recipientEmail: string
  recipientName?: string
  mergeFieldValues: Record<string, string>
  variableAttachmentKey?: string
  participantId?: string
  triggeredById?: string
}

/**
 * Send an email using a stored template.
 * 1. Fetches template
 * 2. Interpolates merge fields in subject + bodyHtml + bodyText
 * 3. Resolves fixedAttachmentIds → S3 downloads
 * 4. Optionally downloads variableAttachmentKey from S3
 * 5. Sends via SES
 * 6. Records NotifSentEmail with result
 */
export async function sendTemplatedEmail(
  opts: SendTemplatedEmailOptions
): Promise<NotifSentEmail> {
  const template = await prisma.notifEmailTemplate.findUnique({
    where: { id: opts.templateId },
  })

  if (!template) {
    throw new Error(`Email template not found: ${opts.templateId}`)
  }

  if (!template.isActive) {
    throw new Error(`Email template is inactive: ${opts.templateId}`)
  }

  // Interpolate merge fields
  const subject = interpolateTemplate(template.subject, opts.mergeFieldValues)
  const bodyHtml = interpolateTemplate(template.bodyHtml, opts.mergeFieldValues)
  const bodyText = template.bodyText
    ? interpolateTemplate(template.bodyText, opts.mergeFieldValues)
    : undefined

  // Resolve fixed document attachments
  const fixedIds = template.fixedAttachmentIds as string[]
  const fixedAttachments = await resolveDocumentAttachments(fixedIds)

  // Collect all attachment S3 keys for recording
  const attachmentKeys: string[] = fixedAttachments.map((a) => a.s3Key)

  // Resolve optional variable attachment
  const allAttachments: SesAttachment[] = fixedAttachments.map((a) => ({
    filename: a.filename,
    content: a.content,
    contentType: a.contentType,
  }))

  if (opts.variableAttachmentKey) {
    const varContent = await downloadFromS3(opts.variableAttachmentKey)
    // Derive filename from the S3 key
    const filename = opts.variableAttachmentKey.split('/').pop() ?? 'attachment'
    allAttachments.push({
      filename,
      content: varContent,
      contentType: 'application/octet-stream',
    })
    attachmentKeys.push(opts.variableAttachmentKey)
  }

  // Send via SES
  let sesMessageId: string | undefined
  let errorMessage: string | undefined
  let status: 'SENT' | 'FAILED' = 'SENT'

  try {
    const result = await sendSesEmail({
      to: opts.recipientEmail,
      subject,
      htmlBody: bodyHtml,
      textBody: bodyText,
      attachments: allAttachments.length > 0 ? allAttachments : undefined,
    })
    sesMessageId = result.messageId
  } catch (err) {
    status = 'FAILED'
    errorMessage = err instanceof Error ? err.message : 'Unknown SES error'
  }

  // Record the send result
  const sentEmail = await prisma.notifSentEmail.create({
    data: {
      templateId: opts.templateId,
      toEmail: opts.recipientEmail,
      toName: opts.recipientName,
      subject,
      bodyHtml,
      sesMessageId,
      status,
      errorMessage,
      sentAt: status === 'SENT' ? new Date() : undefined,
      participantId: opts.participantId,
      attachmentKeys,
      triggeredById: opts.triggeredById,
    },
  })

  return sentEmail
}

// ─── Raw email send ───────────────────────────────────────────────────────

export interface SendRawEmailOptions {
  to: string
  subject: string
  htmlBody: string
  attachments?: SesAttachment[]
  participantId?: string
  triggeredById?: string
}

/**
 * Send a raw email without a template.
 * Records the send in NotifSentEmail.
 */
export async function sendRawEmail(opts: SendRawEmailOptions): Promise<NotifSentEmail> {
  let sesMessageId: string | undefined
  let errorMessage: string | undefined
  let status: 'SENT' | 'FAILED' = 'SENT'

  try {
    const result = await sendSesEmail({
      to: opts.to,
      subject: opts.subject,
      htmlBody: opts.htmlBody,
      attachments: opts.attachments,
    })
    sesMessageId = result.messageId
  } catch (err) {
    status = 'FAILED'
    errorMessage = err instanceof Error ? err.message : 'Unknown SES error'
  }

  const sentEmail = await prisma.notifSentEmail.create({
    data: {
      toEmail: opts.to,
      subject: opts.subject,
      bodyHtml: opts.htmlBody,
      sesMessageId,
      status,
      errorMessage,
      sentAt: status === 'SENT' ? new Date() : undefined,
      participantId: opts.participantId,
      attachmentKeys: [],
      triggeredById: opts.triggeredById,
    },
  })

  return sentEmail
}
