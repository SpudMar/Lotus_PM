import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { deleteFundingPeriod } from '@/lib/modules/plans/funding-periods'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; periodId: string }> },
): Promise<NextResponse> {
  try {
    const session = await requirePermission('plans:write')
    const { periodId } = await params

    await deleteFundingPeriod(periodId, session.user.id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Funding period not found') {
      return NextResponse.json({ error: error.message, code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
