/**
 * GET  /api/billing/fee-schedules — List active fee schedules
 * POST /api/billing/fee-schedules — Create a new fee schedule
 *
 * RBAC: billing:read (GET), billing:write (POST) — PLAN_MANAGER and GLOBAL_ADMIN
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z, ZodError } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { listFeeSchedules, createFeeSchedule } from '@/lib/modules/billing/fee-schedule'
import { createAuditLog } from '@/lib/modules/core/audit'

// ─── Validation ──────────────────────────────────────────────────────────────

const createFeeScheduleSchema = z.object({
  name: z.string().min(1).max(200),
  supportItemCode: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
  rateCents: z.number().int().min(0),
  frequency: z.enum(['MONTHLY', 'PER_INVOICE', 'ONE_OFF']).optional(),
})

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    await requirePermission('billing:read')
    const schedules = await listFeeSchedules()
    return NextResponse.json({ data: schedules })
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('billing:write')
    const body = await request.json()
    const input = createFeeScheduleSchema.parse(body)

    const schedule = await createFeeSchedule(input)

    await createAuditLog({
      userId: session.user.id,
      action: 'billing.fee-schedule-created',
      resource: 'fee-schedule',
      resourceId: schedule.id,
      after: {
        name: input.name,
        supportItemCode: input.supportItemCode,
        rateCents: input.rateCents,
        frequency: input.frequency ?? 'MONTHLY',
      },
    })

    return NextResponse.json({ data: schedule }, { status: 201 })
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
        { status: 400 },
      )
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
