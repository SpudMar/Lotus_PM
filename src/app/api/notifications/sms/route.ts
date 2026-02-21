import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { sendSms, listNotifications } from '@/lib/modules/notifications/notifications'
import { sendSmsSchema } from '@/lib/modules/notifications/validation'
import { createAuditLog } from '@/lib/modules/core/audit'
import { ZodError } from 'zod'

/**
 * GET /api/notifications/sms
 * List sent SMS notifications. Requires notifications:read.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('notifications:read')

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as 'PENDING' | 'SENT' | 'FAILED' | 'DELIVERED' | 'UNDELIVERED' | null
    const participantId = searchParams.get('participantId') ?? undefined
    const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200)
    const offset = Number(searchParams.get('offset') ?? '0')

    const notifications = await listNotifications({
      channel: 'SMS',
      status: status ?? undefined,
      participantId,
      limit,
      offset,
    })

    return NextResponse.json({ data: notifications })
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

/**
 * POST /api/notifications/sms
 * Send an SMS via ClickSend and record the result. Requires notifications:send.
 *
 * Body: { to: string, message: string, participantId?: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('notifications:send')
    const body = await request.json() as unknown
    const input = sendSmsSchema.parse(body)

    const notification = await sendSms(input.to, input.message, {
      participantId: input.participantId,
      triggeredById: session.user.id,
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'notifications.sms.sent',
      resource: 'notif_notification',
      resourceId: notification.id,
      after: {
        channel: 'SMS',
        status: notification.status,
        // No PII — REQ-017: no NDIS numbers, names, or addresses in audit log
      },
    })

    return NextResponse.json({ data: notification }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
