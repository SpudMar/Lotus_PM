/**
 * POST /api/crm/correspondence/send-email
 * Send an email via SES and atomically log it as EMAIL_OUTBOUND correspondence.
 *
 * GET /api/crm/correspondence/send-email
 * Return the allowed from-addresses (for UI dropdown).
 *
 * Auth: comms:write (POST), comms:read (GET)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { sendSesEmail } from '@/lib/modules/notifications/ses-client'
import { createAuditLog } from '@/lib/modules/core/audit'
import type { Prisma } from '@prisma/client'

// ─── Allowed from-address helper ─────────────────────────────────────────────

/**
 * Returns the list of SES-verified from addresses the UI may use.
 * Reads SES_FROM_ADDRESSES (comma-separated) with fallback to SES_FROM_EMAIL.
 */
function getAllowedFromAddresses(): string[] {
  const multi = process.env['SES_FROM_ADDRESSES']
  if (multi) {
    return multi
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0)
  }
  const single = process.env['SES_FROM_EMAIL'] ?? 'noreply@lotusassist.com.au'
  return [single]
}

// ─── Validation schema ────────────────────────────────────────────────────────

const emailCategoryValues = [
  'WELCOME_PACK',
  'SERVICE_AGREEMENT',
  'INVOICE_NOTIFICATION',
  'CLAIM_STATUS',
  'BUDGET_REPORT',
  'APPROVAL_REQUEST',
  'CUSTOM',
] as const

const sendEmailSchema = z.object({
  to: z.string().email(),
  from: z.string().email(),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1).max(20000),
  bodyText: z.string().optional(),
  emailCategory: z.enum(emailCategoryValues),
  templateId: z.string().optional(),
  participantId: z.string().optional(),
  providerId: z.string().optional(),
  coordinatorId: z.string().optional(),
})

type SendEmailInput = z.infer<typeof sendEmailSchema>

// ─── GET — return allowed from-addresses ─────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    await requirePermission('comms:read')
    return NextResponse.json({ data: getAllowedFromAddresses() })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// ─── POST — send email + log correspondence ───────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('comms:write')

    const body = await request.json() as unknown
    const input: SendEmailInput = sendEmailSchema.parse(body)

    // Validate from address is in the allowed list
    const allowed = getAllowedFromAddresses()
    if (!allowed.includes(input.from)) {
      return NextResponse.json(
        { error: 'From address is not in the allowed list', code: 'INVALID_FROM_ADDRESS' },
        { status: 400 }
      )
    }

    // Build text body — if not supplied, strip HTML tags for a plain-text fallback
    const textBody =
      input.bodyText ??
      input.bodyHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

    // Send via SES
    let sesMessageId: string | undefined
    let sendError: string | undefined

    try {
      const result = await sendSesEmail({
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        htmlBody: input.bodyHtml,
        textBody,
        fromAddress: input.from,
      })
      sesMessageId = result.messageId
    } catch (err) {
      sendError = err instanceof Error ? err.message : 'Unknown SES error'
    }

    if (sendError) {
      return NextResponse.json(
        { error: `Failed to send email: ${sendError}`, code: 'SES_ERROR' },
        { status: 502 }
      )
    }

    // Log as CrmCorrespondence (EMAIL_OUTBOUND)
    const metadata: Record<string, unknown> = {
      emailCategory: input.emailCategory,
      sesMessageId: sesMessageId ?? null,
    }
    if (input.cc && input.cc.length > 0) {
      metadata['cc'] = input.cc
    }
    if (input.templateId) {
      metadata['templateId'] = input.templateId
    }

    const correspondence = await prisma.crmCorrespondence.create({
      data: {
        type: 'EMAIL_OUTBOUND',
        subject: input.subject,
        body: textBody.slice(0, 10000),
        fromAddress: input.from,
        toAddress: input.to,
        participantId: input.participantId ?? null,
        providerId: input.providerId ?? null,
        coordinatorId: input.coordinatorId ?? null,
        createdById: session.user.id,
        metadata: metadata as Prisma.InputJsonValue,
      },
    })

    // Record in NotifSentEmail for audit trail
    await prisma.notifSentEmail.create({
      data: {
        templateId: input.templateId ?? null,
        toEmail: input.to,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        sesMessageId: sesMessageId ?? null,
        status: 'SENT',
        sentAt: new Date(),
        participantId: input.participantId ?? null,
        attachmentKeys: [],
        triggeredById: session.user.id,
      },
    })

    // Audit log
    await createAuditLog({
      userId: session.user.id,
      action: 'email.sent',
      resource: 'correspondence',
      resourceId: correspondence.id,
      after: {
        to: input.to,
        from: input.from,
        subject: input.subject,
        emailCategory: input.emailCategory,
        participantId: input.participantId,
        providerId: input.providerId,
        coordinatorId: input.coordinatorId,
      },
    })

    return NextResponse.json(
      { correspondenceId: correspondence.id, sesMessageId: sesMessageId ?? null },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
