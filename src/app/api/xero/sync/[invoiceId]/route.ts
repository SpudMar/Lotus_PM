/**
 * POST /api/xero/sync/[invoiceId]
 *
 * Syncs a single invoice to Xero.
 * - Requires xero:sync permission (Director or Plan Manager)
 * - Invoice must be in APPROVED status
 *
 * REQ-019/REQ-023: Xero integration.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { syncInvoiceToXero } from '@/lib/modules/xero/xero-sync'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('xero:sync')
    const { invoiceId } = await params

    const result = await syncInvoiceToXero(invoiceId, session.user.id)

    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message, code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message.includes('cannot be synced')) {
      return NextResponse.json({ error: error.message, code: 'INVALID_STATUS' }, { status: 422 })
    }
    if (error instanceof Error && error.message === 'Xero is not connected') {
      return NextResponse.json(
        { error: 'Xero is not connected', code: 'XERO_NOT_CONNECTED' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
