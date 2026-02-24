/**
 * POST /api/invoices/[id]/notify-provider
 *
 * Manually trigger a provider notification for an invoice.
 * Accepts a notification type and optional custom message.
 *
 * Roles: PLAN_MANAGER, GLOBAL_ADMIN (invoices:write permission)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { createAuditLog } from '@/lib/modules/core/audit'
import {
  notifyProviderAutoRejected,
  notifyProviderNeedsCodes,
  notifyProviderCustom,
} from '@/lib/modules/notifications/provider-notifications'

// ─── Validation ───────────────────────────────────────────────────────────────

const notifyProviderSchema = z.object({
  type: z.enum(['REJECTION', 'NEEDS_CODES', 'CUSTOM']),
  message: z.string().min(1).max(2000).optional(),
})

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('invoices:write')
    const { id } = await params

    // 1. Parse and validate input
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, { status: 400 })
    }
    const parseResult = notifyProviderSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'VALIDATION_ERROR', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    const { type, message } = parseResult.data

    if (type === 'CUSTOM' && !message) {
      return NextResponse.json(
        { error: 'message is required for CUSTOM notification type', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    // 2. Dispatch notification
    let sent = false

    if (type === 'REJECTION') {
      sent = await notifyProviderAutoRejected({ invoiceId: id })
    } else if (type === 'NEEDS_CODES') {
      sent = await notifyProviderNeedsCodes({ invoiceId: id })
    } else if (type === 'CUSTOM' && message) {
      sent = await notifyProviderCustom({ invoiceId: id, message })
    }

    // 3. Audit log
    await createAuditLog({
      userId: session.user.id,
      action: 'invoice.provider_notified',
      resource: 'invoice',
      resourceId: id,
      after: { type, sent },
    })

    return NextResponse.json({
      data: {
        invoiceId: id,
        type,
        sent,
        message: sent
          ? 'Notification sent to provider'
          : 'Notification skipped — provider has no email address on file',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    console.error('[notify-provider] Unhandled error:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
