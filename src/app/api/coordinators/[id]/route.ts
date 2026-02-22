import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getCoordinator } from '@/lib/modules/crm/coordinators'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requirePermission('coordinator:read')
    const { id } = await params
    const coordinator = await getCoordinator(id)
    return NextResponse.json(coordinator)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Coordinator not found') {
      return NextResponse.json({ error: 'Coordinator not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
