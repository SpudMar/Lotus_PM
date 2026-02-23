/**
 * DELETE /api/service-agreements/[id]/budget-allocations/[allocationId]
 *
 * Remove a budget allocation. PLAN_MANAGER+ only.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { removeAllocation } from '@/lib/modules/service-agreements/budget-allocations'
import { getServiceAgreement } from '@/lib/modules/service-agreements/service-agreements'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; allocationId: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('service-agreements:write')
    const { id, allocationId } = await params

    await getServiceAgreement(id)

    await removeAllocation(allocationId, session.user.id)

    return NextResponse.json({ data: { deleted: true } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (
      error instanceof Error &&
      (error.message === 'Service agreement not found' || error.message === 'NOT_FOUND')
    ) {
      return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
