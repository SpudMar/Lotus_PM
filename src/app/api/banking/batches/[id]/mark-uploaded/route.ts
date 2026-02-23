import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { markBatchUploaded } from '@/lib/modules/banking/payment-batches'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await requirePermission('banking:write')
    const { id } = await params

    const batch = await markBatchUploaded(id, session.user.id)

    return NextResponse.json({ data: batch })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Payment batch not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS') {
      return NextResponse.json({ error: 'ABA must be generated before marking as uploaded', code: 'INVALID_STATUS' }, { status: 409 })
    }
    if (error instanceof Error && error.message === 'ALREADY_UPLOADED') {
      return NextResponse.json({ error: 'Batch already marked as uploaded', code: 'ALREADY_UPLOADED' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
