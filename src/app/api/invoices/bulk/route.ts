/**
 * POST /api/invoices/bulk
 *
 * Bulk invoice operations: approve, reject, or generate claims for multiple
 * invoices in a single request. Uses a partial-success pattern — each invoice
 * is processed independently so failures don't roll back successes.
 *
 * RBAC: invoices:approve permission (PLAN_MANAGER and GLOBAL_ADMIN)
 *
 * Request body:
 *   { action: "approve" | "reject" | "claim", invoiceIds: string[], reason?: string }
 *
 * Response:
 *   { succeeded: string[], failed: { id: string, error: string }[] }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { approveInvoice, rejectInvoice } from '@/lib/modules/invoices/invoices'
import { generateClaimBatch } from '@/lib/modules/claims/claim-generation'
import { bulkInvoiceActionSchema } from '@/lib/modules/invoices/validation'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BulkResult {
  succeeded: string[]
  failed: { id: string; error: string }[]
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('invoices:approve')
    const body = await request.json()
    const input = bulkInvoiceActionSchema.parse(body)

    const { action, invoiceIds, reason } = input
    const result: BulkResult = { succeeded: [], failed: [] }

    if (action === 'approve') {
      for (const invoiceId of invoiceIds) {
        try {
          await approveInvoice(invoiceId, session.user.id)
          result.succeeded.push(invoiceId)
        } catch (err) {
          result.failed.push({
            id: invoiceId,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }
    } else if (action === 'reject') {
      if (!reason) {
        return NextResponse.json(
          { error: 'reason is required for reject action', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }
      for (const invoiceId of invoiceIds) {
        try {
          await rejectInvoice(invoiceId, session.user.id, reason)
          result.succeeded.push(invoiceId)
        } catch (err) {
          result.failed.push({
            id: invoiceId,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }
    } else {
      // action === 'claim': generate one claim per invoice, allow partial success
      for (const invoiceId of invoiceIds) {
        try {
          await generateClaimBatch([invoiceId], session.user.id)
          result.succeeded.push(invoiceId)
        } catch (err) {
          result.failed.push({
            id: invoiceId,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }
    }

    return NextResponse.json(result)
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
