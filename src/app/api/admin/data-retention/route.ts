/**
 * Data Retention API — REQ-010
 *
 * GET  /api/admin/data-retention
 *   Returns the retention policy configuration and estimated purge counts (dry run).
 *   Permission: Global Admin only (staff:read).
 *
 * POST /api/admin/data-retention
 *   Executes the purge of expired records.
 *   Permission: Global Admin only (staff:write).
 *   Requires body: { confirm: true } as a safety guard.
 *   Writes an audit log entry BEFORE purging audit logs.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { createAuditLog } from '@/lib/modules/core/audit'
import {
  RETENTION_YEARS,
  getEligibleCounts,
  purgeExpiredRecords,
} from '@/lib/modules/core/data-retention'

// ── Validation ────────────────────────────────────────────────────────────────

const purgeConfirmSchema = z.object({
  confirm: z.literal(true),
})

// ── GET — dry-run preview ─────────────────────────────────────────────────────

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    // Global Admin only — this is a destructive/sensitive admin operation
    await requirePermission('staff:read')

    const estimates = await getEligibleCounts()

    return NextResponse.json({
      policy: RETENTION_YEARS,
      estimates,
    })
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

// ── POST — execute purge ──────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Global Admin only — destructive operation
    const session = await requirePermission('staff:write')

    // Require explicit confirmation in the request body
    const body: unknown = await request.json()
    const parsed = purgeConfirmSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Confirmation required. Send { "confirm": true } to proceed.', code: 'CONFIRMATION_REQUIRED' },
        { status: 400 },
      )
    }

    // Audit the purge action BEFORE purging old audit logs (REQ-017)
    await createAuditLog({
      userId: session.user.id,
      action: 'data-retention.purge',
      resource: 'system',
      resourceId: 'data-retention',
      after: { triggeredBy: session.user.id, policy: RETENTION_YEARS },
    })

    // Execute the purge
    const purged = await purgeExpiredRecords()

    return NextResponse.json({
      purged,
      totalPurged: purged.total,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
