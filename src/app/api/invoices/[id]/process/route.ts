/**
 * POST /api/invoices/[id]/process
 *
 * Manually trigger AI processing on an invoice.
 * Used for invoices that were uploaded manually and bypassed the
 * automatic email-ingest AI pipeline.
 *
 * Roles: PLAN_MANAGER, GLOBAL_ADMIN (invoices:write permission)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { createAuditLog } from '@/lib/modules/core/audit'
import { getInvoice } from '@/lib/modules/invoices/invoices'
import { processInvoice } from '@/lib/modules/invoices/processing-engine'

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('invoices:write')
    const { id } = await params

    // 1. Check invoice exists
    const invoice = await getInvoice(id)
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // 2. Run AI processing pipeline (never throws — failures return NEEDS_REVIEW)
    const result = await processInvoice(id)

    // 3. Audit log
    await createAuditLog({
      userId: session.user.id,
      action: 'invoice.ai_processed',
      resource: 'invoice',
      resourceId: id,
      after: { category: result.category },
    })

    return NextResponse.json({
      data: {
        invoiceId: result.invoiceId,
        category: result.category,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    console.error('[invoice/process] Unhandled error:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
