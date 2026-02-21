import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { reconcilePayments } from '@/lib/modules/banking/banking'
import { reconcilePaymentsSchema } from '@/lib/modules/banking/validation'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('banking:write')
    const body = await request.json()
    const input = reconcilePaymentsSchema.parse(body)

    const result = await reconcilePayments(input.paymentIds, session.user.id)
    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
