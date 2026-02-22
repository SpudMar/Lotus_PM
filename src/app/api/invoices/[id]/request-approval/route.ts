import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { requestParticipantApproval } from '@/lib/modules/invoices/participant-approval'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('invoices:approve')
    const { id } = await params
    const result = await requestParticipantApproval(id, session.user.id)
    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Invoice not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (
      error instanceof Error &&
      error.message === 'Participant approval not enabled for this participant'
    ) {
      return NextResponse.json(
        { error: error.message, code: 'APPROVAL_NOT_ENABLED' },
        { status: 422 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
