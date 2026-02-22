/**
 * AWS SES v2 client for sending emails.
 * REQ-001: AWS Sydney (ap-southeast-2) only.
 * REQ-011: All data remains in ap-southeast-2.
 * REQ-016: In-transit encryption enforced by SES/TLS.
 *
 * This module is a thin wrapper around @aws-sdk/client-sesv2.
 * It does NOT record sends — that is handled by email-send.ts.
 */

import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandInput,
} from '@aws-sdk/client-sesv2'

// ─── SES client singleton ─────────────────────────────────────────────────

let _sesClient: SESv2Client | null = null

function getSesClient(): SESv2Client {
  if (!_sesClient) {
    _sesClient = new SESv2Client({
      region: process.env['AWS_REGION'] ?? 'ap-southeast-2',
    })
  }
  return _sesClient
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface SesAttachment {
  filename: string
  content: Buffer
  contentType: string
}

export interface SendSesEmailParams {
  to: string
  subject: string
  htmlBody: string
  textBody?: string
  attachments?: SesAttachment[]
  fromAddress?: string
}

export interface SendSesEmailResult {
  messageId: string
}

// ─── Send ─────────────────────────────────────────────────────────────────

/**
 * Send an email via AWS SES v2.
 * fromAddress defaults to SES_FROM_EMAIL env var or 'noreply@lotusassist.com.au'.
 *
 * When attachments are present we build a raw MIME message because SES Simple
 * email does not support attachments — we use SendEmailCommand with Content.Raw.
 */
export async function sendSesEmail(params: SendSesEmailParams): Promise<SendSesEmailResult> {
  const from = params.fromAddress ?? process.env['SES_FROM_EMAIL'] ?? 'noreply@lotusassist.com.au'

  if (params.attachments && params.attachments.length > 0) {
    return sendSesEmailWithAttachments({ ...params, fromAddress: from })
  }

  const input: SendEmailCommandInput = {
    FromEmailAddress: from,
    Destination: {
      ToAddresses: [params.to],
    },
    Content: {
      Simple: {
        Subject: {
          Data: params.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: params.htmlBody,
            Charset: 'UTF-8',
          },
          ...(params.textBody
            ? { Text: { Data: params.textBody, Charset: 'UTF-8' } }
            : {}),
        },
      },
    },
  }

  const response = await getSesClient().send(new SendEmailCommand(input))

  return { messageId: response.MessageId ?? '' }
}

// ─── Raw MIME send (with attachments) ────────────────────────────────────

/**
 * Build a raw MIME email with attachments and send via SES.
 * Uses the multipart/mixed MIME structure required for attachments.
 */
async function sendSesEmailWithAttachments(
  params: SendSesEmailParams & { fromAddress: string }
): Promise<SendSesEmailResult> {
  const boundary = `boundary-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const lines: string[] = []

  lines.push(`From: ${params.fromAddress}`)
  lines.push(`To: ${params.to}`)
  lines.push(`Subject: ${params.subject}`)
  lines.push('MIME-Version: 1.0')
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
  lines.push('')

  // HTML body part
  lines.push(`--${boundary}`)
  lines.push('Content-Type: multipart/alternative; boundary="alt-boundary"')
  lines.push('')
  lines.push('--alt-boundary')
  if (params.textBody) {
    lines.push('Content-Type: text/plain; charset=UTF-8')
    lines.push('')
    lines.push(params.textBody)
    lines.push('')
    lines.push('--alt-boundary')
  }
  lines.push('Content-Type: text/html; charset=UTF-8')
  lines.push('')
  lines.push(params.htmlBody)
  lines.push('')
  lines.push('--alt-boundary--')
  lines.push('')

  // Attachment parts
  for (const attachment of params.attachments ?? []) {
    lines.push(`--${boundary}`)
    lines.push(`Content-Type: ${attachment.contentType}`)
    lines.push('Content-Transfer-Encoding: base64')
    lines.push(`Content-Disposition: attachment; filename="${attachment.filename}"`)
    lines.push('')
    lines.push(attachment.content.toString('base64'))
    lines.push('')
  }

  lines.push(`--${boundary}--`)

  const rawMessage = lines.join('\r\n')

  const input: SendEmailCommandInput = {
    Content: {
      Raw: {
        Data: Buffer.from(rawMessage),
      },
    },
  }

  const response = await getSesClient().send(new SendEmailCommand(input))
  return { messageId: response.MessageId ?? '' }
}
