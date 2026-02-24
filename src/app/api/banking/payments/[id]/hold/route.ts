import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { holdPayment, releasePayment } from '@/lib/modules/banking/payment-batches'
import { z, ZodError } from 'zod'

const holdActionSchema = z.object({
  action: z.enum(['hold', 'release']),
  reason: z.string().min(1).max(500).optional(),
}).refine(
  (data) => data.action !== 'hold' || (data.reason !== undefined && data.reason.length > 0),
  { message: 'Reason is required when placing a payment on hold', path: ['reason'] },
)

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await requirePermission('banking:write')
    const { id } = await params
    const body = await request.json()
    const input = holdActionSchema.parse(body)

    let payment
    if (input.action === 'hold') {
      payment = await holdPayment(id, input.reason as string, session.user.id)
    } else {
      payment = await releasePayment(id, session.user.id)
    }

    return NextResponse.json({ data: payment })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Payment not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS') {
      return NextResponse.json({ error: 'Payment is not in a valid status for this action', code: 'INVALID_STATUS' }, { status: 409 })
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
