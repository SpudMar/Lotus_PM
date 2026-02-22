import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { activateServiceAgreement } from '@/lib/modules/service-agreements/service-agreements'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('service-agreements:write')
    const { id } = await params
    const updated = await activateServiceAgreement(id, session.user.id)
    return NextResponse.json({ data: updated })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Service agreement not found') {
      return NextResponse.json({ error: 'Service agreement not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message.includes('Cannot activate')) {
      return NextResponse.json({ error: error.message, code: 'BAD_REQUEST' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
