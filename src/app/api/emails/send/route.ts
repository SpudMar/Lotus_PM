/**
 * POST /api/emails/send — send an email (templated or raw) (notifications:send)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { ZodError, z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { sendTemplatedEmail, sendRawEmail } from '@/lib/modules/notifications/email-send'

const sendBodySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('template'),
    templateId: z.string().min(1),
    recipientEmail: z.string().email(),
    recipientName: z.string().optional(),
    mergeFieldValues: z.record(z.string(), z.string()).optional().default({}),
    variableAttachmentKey: z.string().optional(),
    participantId: z.string().optional(),
  }),
  z.object({
    mode: z.literal('raw'),
    to: z.string().email(),
    subject: z.string().min(1).max(500),
    htmlBody: z.string().min(1),
    participantId: z.string().optional(),
  }),
])

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('notifications:send')
    const body = await request.json() as unknown
    const input = sendBodySchema.parse(body)

    if (input.mode === 'template') {
      const result = await sendTemplatedEmail({
        templateId: input.templateId,
        recipientEmail: input.recipientEmail,
        recipientName: input.recipientName,
        mergeFieldValues: input.mergeFieldValues,
        variableAttachmentKey: input.variableAttachmentKey,
        participantId: input.participantId,
        triggeredById: session.user.id,
      })
      return NextResponse.json({ data: result }, { status: 201 })
    }

    const result = await sendRawEmail({
      to: input.to,
      subject: input.subject,
      htmlBody: input.htmlBody,
      participantId: input.participantId,
      triggeredById: session.user.id,
    })

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message, code: 'BAD_REQUEST' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
