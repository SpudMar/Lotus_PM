/**
 * POST /api/invoices/[id]/version — create a new version of an invoice
 *
 * Auth: PLAN_MANAGER+ (invoices:write)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { createNewVersion } from '@/lib/modules/invoices/invoice-versioning'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('invoices:write')
    const { id } = await params
    const newInvoice = await createNewVersion(id, session.user.id)
    return NextResponse.json({ data: newInvoice }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
