import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { generateBatchAba } from '@/lib/modules/banking/payment-batches'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await requirePermission('banking:generate')
    const { id } = await params

    const { abaContent, filename } = await generateBatchAba(id, session.user.id)

    return NextResponse.json({
      data: { abaContent, filename },
    })
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
    if (error instanceof Error && error.message === 'ABA_ALREADY_GENERATED') {
      return NextResponse.json({ error: 'ABA file already generated for this batch', code: 'ABA_ALREADY_GENERATED' }, { status: 409 })
    }
    if (error instanceof Error && error.message === 'NO_PENDING_PAYMENTS') {
      return NextResponse.json({ error: 'Batch has no pending payments to generate ABA for', code: 'NO_PENDING_PAYMENTS' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
