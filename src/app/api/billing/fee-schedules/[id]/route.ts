/**
 * PATCH /api/billing/fee-schedules/[id] — Update a fee schedule
 *
 * RBAC: billing:write — PLAN_MANAGER and GLOBAL_ADMIN
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z, ZodError } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { updateFeeSchedule } from '@/lib/modules/billing/fee-schedule'
import { createAuditLog } from '@/lib/modules/core/audit'

// ─── Validation ──────────────────────────────────────────────────────────────

const updateFeeScheduleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  supportItemCode: z.string().min(1).max(50).optional(),
  description: z.string().max(500).optional(),
  rateCents: z.number().int().min(0).optional(),
  frequency: z.enum(['MONTHLY', 'PER_INVOICE', 'ONE_OFF']).optional(),
  isActive: z.boolean().optional(),
})

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('billing:write')
    const { id } = await params
    const body = await request.json()
    const input = updateFeeScheduleSchema.parse(body)

    const result = await updateFeeSchedule(id, input)

    await createAuditLog({
      userId: session.user.id,
      action: 'billing.fee-schedule-updated',
      resource: 'fee-schedule',
      resourceId: id,
      after: input,
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Fee schedule not found') {
      return NextResponse.json({ error: 'Fee schedule not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
