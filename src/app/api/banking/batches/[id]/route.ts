import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getPaymentBatch } from '@/lib/modules/banking/payment-batches'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requirePermission('banking:read')
    const { id } = await params
    const batch = await getPaymentBatch(id)

    if (!batch) {
      return NextResponse.json({ error: 'Payment batch not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({ data: batch })
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
