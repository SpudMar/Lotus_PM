import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listCoordinators } from '@/lib/modules/crm/coordinators'

export async function GET(): Promise<NextResponse> {
  try {
    await requirePermission('coordinator:read')
    const coordinators = await listCoordinators()
    return NextResponse.json(coordinators)
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
