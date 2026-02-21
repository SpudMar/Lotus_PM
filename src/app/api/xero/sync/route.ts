/**
 * POST /api/xero/sync
 *
 * Syncs all approved, unsynced invoices to Xero.
 * - Requires xero:sync permission (Plan Manager or Global Admin)
 * - Processes up to 100 invoices per call (batched internally)
 * - Returns count of synced and failed invoices
 *
 * REQ-019/REQ-023: Xero integration.
 */

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { syncPendingInvoicesToXero } from '@/lib/modules/xero/xero-sync'

export async function POST(): Promise<NextResponse> {
  try {
    const session = await requirePermission('xero:sync')

    const result = await syncPendingInvoicesToXero(session.user.id)

    return NextResponse.json({
      data: {
        syncedCount: result.synced.length,
        errorCount: result.errors.length,
        synced: result.synced,
        errors: result.errors,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
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
